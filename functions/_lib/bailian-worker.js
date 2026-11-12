/**
 * Process queued remake jobs.
 *
 * Primary path is Agnes Video 2.5 reference mode when VIDEO_PROVIDER is agnes
 * (the default) and PUBLIC_SITE_APEX is a public custom domain. A template
 * that fits in 2–12s is one job. A longer template is cut into 4–12s pieces,
 * every piece is submitted together, and the results are joined here.
 * wan2.2-animate-mix
 * is the fallback only when a split cannot make every piece fit, or for fps,
 * size, format, a missing public origin, or an Agnes refusal before a task exists.
 *
 * One pass submits new tasks and polls tasks already running. Video generation
 * takes minutes. Create starts a pass with waitUntil and keeps polling that
 * job for a short follow window. Pages Functions have no cron, so
 * workers/job-drain posts /api/jobs/process every minute and that call keeps
 * polling while work is in flight. The browser only reads job status from
 * this app. It does not call the provider. Ops can still repeat
 * POST /api/jobs/process (see scripts/smoke-bailian.mjs). wait_ms can poll
 * inside one request. Agnes polls wait at least 6s and back off after 429.
 *
 * Subject images are the stored R2 photos. Agnes reference mode sends every
 * slot (`photo`, then `photo-2` when photoCount is 2) in `images`. The prompt
 * names each slot. wan2.2-animate-mix takes one image_url. A template that
 * needs more photos than the selected path can send fails with
 * reference_photos and one refund. The second photo is never dropped.
 *
 * Bailian uploads the photo and the template demo to DashScope temporary
 * storage. image_url and video_url sent to Bailian are oss:// only.
 * Agnes receives public https URLs on the custom domain: a signed photo link
 * and /brand/templates/{slug}-demo.mp4. Never pass *.pages.dev, *.workers.dev,
 * or *.r2.dev to either provider.
 */

import {
  claimProviderPoll,
  claimQueuedJob,
  clearProviderTask,
  deferQueuedJob,
  fail,
  listRemakeCandidates,
  markJobFailed,
  noteIdleBackoff,
  noteRunningBackoff,
  refundOutstandingFailures,
  replaceProviderTask,
  revertQueuedJob,
  saveProviderTask,
} from './account-db.js';
import { adaptPack, formatAgnesCreatePayload, getPack } from '../../packages/template-pipeline/src/index.js';
import {
  AGNES_IMAGE_TOTAL_MAX_BYTES,
  AGNES_POLL_MIN_MS,
  AGNES_VIDEO_MAX_BYTES,
  agnesInputUrls,
  agnesMediaDecision,
  agnesPhotoUrls,
  agnesPollDelayMs,
  agnesSegmentInputs,
  createReferenceVideo,
  downloadAgnesVideo,
  getAgnesVideo,
  packAgnesTaskId,
  packAgnesTaskSet,
  probeReferenceMp4,
  redactAgnesDetail,
  referencePhotoKinds,
  referencePrompt,
  unpackAgnesTaskId,
} from './agnes.js';
import { concatMp4, cutReferenceMp4 } from './mp4-segments.js';
import {
  BAILIAN_IMAGE_MAX_BYTES,
  downloadResultVideo,
  getAnimateTask,
  redactDetail,
  submitAnimateMove,
  uploadTempFile,
} from './bailian.js';
import { readImageSize } from './image-precheck.js';
import { mp4HasAudio, muxStyleAudio } from './mp4-finish.js';
import { extraUploadKeys } from './job-media.js';
import { getTemplate } from './templates.js';
import { storeJobResult } from './job-media.js';
import {
  deleteMedia,
  getMedia,
  mediaConfigured,
  partObjectKey,
  putMedia,
  requestOrigin,
  segmentObjectKey,
  sniffImage,
  sniffMp4,
  VIDEO_MAX_BYTES,
} from './r2-media.js';
import { plannedReferenceImages, providerConfigured, videoBackends, selectRemakeProvider } from './video-provider.js';

// The stale clock starts at claim. After that the job is `running` with no
// task id while two temp uploads (60s each) and synthesis (30s) run.
// Reference fetch (60s) sits in front of claim. Those timeouts stack past
// three minutes. Eight minutes leaves margin so a live Create waitUntil is
// not treated as stale by /api/jobs/continue or the two-minute job drain.
export const SUBMIT_STALE_MS = 8 * 60 * 1000;

const NOTES = {
  photo_too_large: {
    en: 'This photo is over 5 MB, which the video model does not accept.',
    zh: '这张照片超过 5 MB，视频模型无法接受。',
  },
  no_photo: {
    en: 'This job has no stored photo, so a clip cannot be generated.',
    zh: '这个任务没有已保存的照片，无法生成短片。',
  },
  no_reference_video: {
    en: 'This look has no reference clip yet, so a video cannot be generated.',
    zh: '这个风格还没有参考视频，无法生成。',
  },
  provider_task_taken: {
    en: 'This clip could not be started. Please try again from Create.',
    zh: '这条短片没能开始生成。请在创作页再试一次。',
  },
  failed: {
    en: 'Video generation failed. Please try again from Create.',
    zh: '视频生成失败。请在创作页再试一次。',
  },
  audio_mux: {
    en: 'The clip could not be finished with sound. Please try again from Create.',
    zh: '这条短片没能配上声音。请在创作页再试一次。',
  },
  reference_photos: {
    en: 'This look needs every uploaded photo in the clip. The clip was not generated, and the charge was returned.',
    zh: '这个效果需要把上传的每张照片都用进成片。短片没有生成，积分已退回。',
  },
};

function noteFor(code) {
  return NOTES[code] || NOTES.failed;
}

function referencePhotoNote(template) {
  if (template && template.photoCount === 2) {
    return {
      note_en: 'This look needs both photos in the clip. The clip was not generated, and the charge was returned.',
      note_zh: '这个效果需要把两张照片都放进成片。短片没有生成，积分已退回。',
    };
  }
  return {
    note_en: NOTES.reference_photos.en,
    note_zh: NOTES.reference_photos.zh,
  };
}

function failReferencePhotos(db, row, template) {
  return failJob(db, row, 'reference_photos', referencePhotoNote(template));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readStoredBytes(obj) {
  if (!obj) return null;
  if (typeof obj.arrayBuffer === 'function') return new Uint8Array(await obj.arrayBuffer());
  const body = obj.body;
  if (body instanceof Uint8Array) return body;
  if (body && typeof body.arrayBuffer === 'function') return new Uint8Array(await body.arrayBuffer());
  if (body) return new Uint8Array(await new Response(body).arrayBuffer());
  return null;
}

function referenceUrl(origin, referenceVideo) {
  if (typeof referenceVideo !== 'string' || !referenceVideo.startsWith('/brand/templates/')) return null;
  if (!/^\/brand\/templates\/[a-z0-9-]+-demo\.mp4$/.test(referenceVideo)) return null;
  const url = new URL(referenceVideo, origin);
  if (url.origin !== origin) return null;
  return url.toString();
}

async function readBodyBytes(res) {
  if (!res || typeof res.arrayBuffer !== 'function') return null;
  return new Uint8Array(await res.arrayBuffer());
}

async function loadReferenceVideo(env, origin, referenceVideo, fetchImpl) {
  const url = referenceUrl(origin, referenceVideo);
  if (!url) throw fail('no_reference_video');
  if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
    try {
      const asset = await env.ASSETS.fetch(new Request(url, { method: 'GET' }));
      const bytes = await readBodyBytes(asset);
      if (asset && asset.ok && sniffMp4(bytes)) return bytes;
    } catch (err) {
      console.error('reference_assets', err && err.name ? err.name : 'error');
    }
  }
  // Same deployment only. This URL is never copied into the Bailian request.
  let res;
  try {
    res = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    const wrapped = fail('reference_fetch');
    wrapped.cause = err;
    throw wrapped;
  }
  if (!res.ok) throw fail(res.status === 404 ? 'no_reference_video' : 'reference_fetch');
  const bytes = await readBodyBytes(res);
  if (!sniffMp4(bytes)) throw fail('no_reference_video');
  return bytes;
}

async function failJob(db, row, code, extra) {
  const note = noteFor(code);
  await markJobFailed(db, row.id, {
    error_code: code,
    note_en: extra && extra.note_en ? extra.note_en : note.en,
    note_zh: extra && extra.note_zh ? extra.note_zh : note.zh,
  });
  return {
    id: row.id,
    status: 'failed',
    action: 'failed',
    error: code,
    detail: extra && extra.detail ? extra.detail : '',
  };
}

function ageMs(updatedAt, nowMs) {
  const at = Date.parse(String(updatedAt || ''));
  if (!Number.isFinite(at)) return SUBMIT_STALE_MS;
  return nowMs - at;
}

async function submitBailian(ctx, row, prepared) {
  const { db, runtime, fetchImpl } = ctx;
  if (!plannedReferenceImages(prepared.template, 'bailian')) return failReferencePhotos(db, row, prepared.template);
  if (!runtime || !runtime.configured) return failJob(db, row, 'failed');
  if (prepared.image.bytes.byteLength > BAILIAN_IMAGE_MAX_BYTES) return failJob(db, row, 'photo_too_large');
  let imageUrl = '';
  let videoUrl = '';
  try {
    imageUrl = await uploadTempFile(runtime, fetchImpl, prepared.image);
    videoUrl = await uploadTempFile(runtime, fetchImpl, {
      bytes: prepared.reference,
      contentType: 'video/mp4',
      filename: 'reference.mp4',
    });
  } catch (err) {
    if (err && (err.transient || err.code === 'reference_fetch')) {
      await revertQueuedJob(db, row.id);
      return {
        id: row.id,
        status: 'queued',
        action: 'retry',
        error: err.code === 'reference_fetch' ? 'reference_fetch' : 'bailian_upload',
        detail: redactDetail(err.providerMessage, runtime.apiKey),
      };
    }
    const code = err && err.code === 'bailian_error' ? `bailian_${err.providerCode}` : (err && err.code) || 'failed';
    console.error('bailian_submit', row.id, code);
    return failJob(db, row, code, { detail: redactDetail(err && err.providerMessage, runtime.apiKey) });
  }

  try {
    const submitted = await submitAnimateMove(runtime, fetchImpl, { imageUrl, videoUrl });
    await saveProviderTask(db, row.id, submitted.taskId);
    return { id: row.id, status: 'running', action: 'submitted', task_id: submitted.taskId, provider: 'bailian' };
  } catch (err) {
    if (err && err.code === 'provider_task_taken') {
      console.error('provider_task_taken', row.id);
      return failJob(db, row, 'provider_task_taken');
    }
    if (err && err.code === 'storage_error') {
      // The row was no longer claimable (requeued, failed, or another id won).
      // Failing here would refund a job that may already hold a task id.
      console.error('bailian_synthesis', row.id, 'task_not_saved');
      return { id: row.id, status: 'running', action: 'submit_unsaved', error: 'storage_error' };
    }
    const code = err && err.providerCode ? `bailian_${err.providerCode}` : 'bailian_submit_uncertain';
    console.error('bailian_synthesis', row.id, code);
    return failJob(db, row, code, {
      detail: redactDetail(err && err.providerMessage, runtime.apiKey),
      note_en: 'Video generation did not start. Please try again from Create.',
      note_zh: '视频生成没有开始。请在创作页再试一次。',
    });
  }
}

async function readSubjects(bucket, row, photoCount) {
  const kinds = referencePhotoKinds(photoCount);
  if (!kinds) throw fail('reference_photos');
  const keys = [row.upload_key, row.upload_key_2, ...extraUploadKeys(row)];
  const images = [];
  for (let index = 0; index < kinds.length; index += 1) {
    if (!keys[index]) throw fail('no_photo');
    const obj = await getMedia(bucket, keys[index]);
    const bytes = await readStoredBytes(obj);
    const sniffed = sniffImage(bytes);
    if (!sniffed) throw fail('no_photo');
    const filename = index === 0 ? `subject.${sniffed.ext}` : `subject-${index + 1}.${sniffed.ext}`;
    images.push({ bytes, contentType: sniffed.contentType, filename });
  }
  return images;
}

function retryHoldMs(row, nowMs) {
  const match = /^retry_later_(\d+)$/.exec(row && row.error_code ? row.error_code : '');
  if (!match) return 0;
  const delay = Number(match[1]);
  if (!Number.isFinite(delay) || delay < 1000) return 0;
  const elapsed = ageMs(row.updated_at, nowMs);
  if (elapsed >= delay) return 0;
  return delay - elapsed;
}

function imageDecision(template, image, reference) {
  const sniffed = sniffImage(image.bytes);
  const size = sniffed ? readImageSize(image.bytes, sniffed.ext) : null;
  return agnesMediaDecision({
    durationSeconds: template && template.durationSeconds,
    videoBytes: reference,
    imageBytes: image.bytes.byteLength,
    imageWidth: size ? size.width : 0,
    imageHeight: size ? size.height : 0,
  });
}

function chooseProvider(ctx, template, images, reference) {
  const list = Array.isArray(images) ? images : [images];
  let decision = null;
  let total = 0;
  for (const image of list) {
    total += image.bytes.byteLength;
    const next = imageDecision(template, image, reference);
    if (!next.ok) return selectRemakeProvider(ctx.backends, next);
    decision = next;
  }
  if (decision && decision.ok && total >= AGNES_IMAGE_TOTAL_MAX_BYTES) {
    decision = { ok: false, reason: 'image_size', duration: decision.duration };
  }
  return selectRemakeProvider(ctx.backends, decision);
}

function agnesCode(err) {
  if (!err) return 'failed';
  if (err.code === 'agnes_error') return `agnes_${err.providerCode || 'error'}`;
  return err.code || 'failed';
}

function storedPhotoCount(row) {
  const extra = extraUploadKeys(row);
  return [row && row.upload_key, row && row.upload_key_2, ...extra].filter(Boolean).length;
}

function pipelineImages(template, row) {
  const count = storedPhotoCount(row);
  const slots = template.photoSlots || [];
  const images = [];
  for (let index = 0; index < count; index += 1) {
    const slot = slots[index];
    images.push({
      role: index === 0 ? 'lead' : '',
      shared: count === 1 && row.pipeline_frame === 'together',
      label: slot && slot.replacesEn,
    });
  }
  if (count === 1) images[0].role = 'lead';
  return images;
}

function agnesCreateInput(template, inputs, seconds) {
  if (!inputs || !Array.isArray(inputs.imageUrls)) return null;
  if (inputs.imageOnly) {
    if (!inputs.prompt) return null;
    return {
      imageOnly: true,
      imageUrls: inputs.imageUrls,
      seconds,
      prompt: inputs.prompt,
    };
  }
  if (inputs.imageUrls.length !== template.photoCount) return null;
  return {
    imageUrls: inputs.imageUrls,
    videoUrl: inputs.videoUrl,
    seconds,
    prompt: inputs.prompt || referencePrompt(template),
  };
}

async function segmentInputs(ctx, row, prepared, segment) {
  if (prepared.pipeline) {
    const photoCount = prepared.photoCount;
    const urls = await agnesPhotoUrls(ctx.env, row.id, photoCount);
    if (!urls || !segment.prompt) return null;
    return {
      imageOnly: true,
      imageUrls: urls.imageUrls,
      prompt: segment.prompt,
      seconds: segment.seconds,
    };
  }
  const segments = prepared.selection && prepared.selection.segments;
  const count = segments && segments.length ? segments.length : 1;
  const photoCount = prepared.template.photoCount;
  if (count < 2) return agnesInputUrls(ctx.env, row.id, prepared.template.referenceVideo, photoCount);
  let cut;
  try {
    cut = cutReferenceMp4(prepared.reference, segment.start, segment.end);
  } catch (err) {
    console.error('segment_cut', row.id, err && err.code ? err.code : 'error');
    const wrapped = fail('segment_media');
    wrapped.cause = err;
    throw wrapped;
  }
  const probed = probeReferenceMp4(cut);
  const tooLong = probed.durationSeconds != null && (probed.durationSeconds < 2 || probed.durationSeconds > 12.05);
  if (cut.byteLength >= AGNES_VIDEO_MAX_BYTES || tooLong) throw fail('segment_media');
  await putMedia(ctx.bucket, segmentObjectKey(row.user_id, row.id, segment.index), cut, {
    contentType: 'video/mp4',
    customMetadata: { kind: 'segment', job_id: row.id },
  });
  return agnesSegmentInputs(ctx.env, row.id, segment.index, prepared.template.photoCount);
}

async function submitAgnesSegment(ctx, row, prepared, index) {
  const { db, agnes, fetchImpl } = ctx;
  const segments = (prepared.selection && prepared.selection.segments) || [
    { index: 0, seconds: prepared.seconds },
  ];
  const segment = segments[index];
  if (!segment) return failJob(db, row, 'failed');
  let inputs;
  try {
    inputs = await segmentInputs(ctx, row, prepared, segment);
  } catch (err) {
    console.error('agnes_input', row.id, err && err.code ? err.code : 'error');
    if (index === 0) return { fallback: true };
    return failJob(db, row, 'failed');
  }
  const requestInput = agnesCreateInput(prepared.template, inputs, segment.seconds);
  if (!requestInput) {
    if (prepared.template.photoCount > 1) return failReferencePhotos(db, row, prepared.template);
    return index === 0 ? { fallback: true } : failJob(db, row, 'failed');
  }
  let created;
  try {
    created = await createReferenceVideo(agnes, fetchImpl, requestInput);
  } catch (err) {
    // Refused or unreachable before a task id exists. Mix can still run for a
    // one-photo look. A look that needs more photos than mix can take fails instead.
    const outage = err && (err.rejected || err.code === 'agnes_submit_uncertain' || (err.transient && err.httpStatus !== 429));
    if (outage && index === 0) return { fallback: true };
    if (err && err.httpStatus === 429) {
      const wait = agnesPollDelayMs(prepared.backoffMs);
      const code = `retry_later_${wait}`;
      const deferred = index === 0 ? await deferQueuedJob(db, row.id, code) : await noteIdleBackoff(db, row.id, code);
      if (!deferred) return { id: row.id, status: 'running', action: 'busy', provider: 'agnes' };
      return {
        id: row.id,
        status: index === 0 ? 'queued' : 'running',
        action: 'retry',
        error: 'retry_later',
        retry_after_ms: wait,
        provider: 'agnes',
      };
    }
    const code = err && err.code === 'agnes_submit_uncertain'
      ? 'agnes_submit_uncertain'
      : err && err.providerCode
        ? `agnes_${err.providerCode}`
        : 'agnes_submit_uncertain';
    console.error('agnes_create', row.id, code);
    return failJob(db, row, code, {
      detail: redactAgnesDetail(err && err.providerMessage, agnes && agnes.apiKey),
      note_en: 'Video generation did not start. Please try again from Create.',
      note_zh: '视频生成没有开始。请在创作页再试一次。',
    });
  }
  let storedId;
  try {
    storedId = packAgnesTaskId(created.videoId, index, segments.length);
  } catch (err) {
    console.error('agnes_create', row.id, 'agnes_bad_task');
    if (index === 0) return { fallback: true };
    return failJob(db, row, 'agnes_submit_uncertain', {
      note_en: 'Video generation did not start. Please try again from Create.',
      note_zh: '视频生成没有开始。请在创作页再试一次。',
    });
  }
  try {
    await saveProviderTask(db, row.id, storedId);
    return { id: row.id, status: 'running', action: 'submitted', task_id: storedId, provider: 'agnes' };
  } catch (err) {
    if (err && err.code === 'provider_task_taken') {
      console.error('provider_task_taken', row.id);
      return failJob(db, row, 'provider_task_taken');
    }
    if (err && err.code === 'storage_error') {
      console.error('agnes_create', row.id, 'task_not_saved');
      return { id: row.id, status: 'running', action: 'submit_unsaved', error: 'storage_error', provider: 'agnes' };
    }
    throw err;
  }
}

function createFailureKind(err) {
  if (!err) return 'hard';
  if (err.httpStatus === 429) return 'rate';
  if (err.rejected || err.code === 'agnes_submit_uncertain' || (err.transient && err.httpStatus !== 429)) return 'outage';
  return 'hard';
}

function rateLimitResult(row, wait, queued) {
  return {
    id: row.id,
    status: queued ? 'queued' : 'running',
    action: 'retry',
    error: 'retry_later',
    retry_after_ms: wait,
    provider: 'agnes',
  };
}

async function createPiece(ctx, template, inputs, segment) {
  const requestInput = agnesCreateInput(template, inputs, segment.seconds);
  if (!requestInput) return { err: fail('reference_photos') };
  try {
    const created = await createReferenceVideo(ctx.agnes, ctx.fetchImpl, requestInput);
    return { videoId: created.videoId };
  } catch (err) {
    return { err };
  }
}

async function rememberSlots(ctx, row, slots) {
  let packed;
  try {
    packed = packAgnesTaskSet(slots);
  } catch (err) {
    console.error('agnes_create', row.id, 'agnes_bad_task');
    return failJob(ctx.db, row, 'agnes_submit_uncertain', {
      note_en: 'Video generation did not start. Please try again from Create.',
      note_zh: '视频生成没有开始。请在创作页再试一次。',
    });
  }
  try {
    if (!row.provider_task_id) {
      await saveProviderTask(ctx.db, row.id, packed);
    } else if (row.provider_task_id !== packed) {
      const replaced = await replaceProviderTask(ctx.db, row.id, row.provider_task_id, packed);
      if (!replaced) return { id: row.id, status: 'running', action: 'busy', provider: 'agnes' };
    }
  } catch (err) {
    if (err && err.code === 'provider_task_taken') return failJob(ctx.db, row, 'provider_task_taken');
    if (err && err.code === 'storage_error') {
      console.error('agnes_create', row.id, 'task_not_saved');
      return { id: row.id, status: 'running', action: 'submit_unsaved', error: 'storage_error', provider: 'agnes' };
    }
    throw err;
  }
  row.provider_task_id = packed;
  return null;
}

async function submitAgnesParallel(ctx, row, prepared) {
  const { db } = ctx;
  const segments = prepared.selection.segments;
  const inputs = [];
  try {
    for (const segment of segments) {
      const one = await segmentInputs(ctx, row, prepared, segment);
      if (!one) return { fallback: true };
      inputs.push(one);
    }
  } catch (err) {
    console.error('agnes_input', row.id, err && err.code ? err.code : 'error');
    return { fallback: true };
  }
  const created = await Promise.all(segments.map((segment, index) => createPiece(ctx, prepared.template, inputs[index], segment)));
  const slots = created.map((item) => (item && item.videoId ? item.videoId : ''));
  const kinds = created.map((item) => (item && item.videoId ? 'ok' : createFailureKind(item && item.err)));
  const anyId = slots.some(Boolean);
  const anyRate = kinds.includes('rate');
  const anyOutage = kinds.includes('outage');
  const anyHard = kinds.includes('hard');
  if (!anyId) {
    if (anyOutage || (!anyRate && !anyHard)) return { fallback: true };
    if (anyRate && !anyHard) {
      const wait = agnesPollDelayMs(prepared.backoffMs);
      const deferred = await deferQueuedJob(db, row.id, `retry_later_${wait}`);
      if (!deferred) return { id: row.id, status: 'running', action: 'busy', provider: 'agnes' };
      return rateLimitResult(row, wait, true);
    }
    const failed = created.find((item) => item && item.err);
    if (failed && failed.err && failed.err.code === 'reference_photos') {
      return failReferencePhotos(db, row, prepared.template);
    }
    const code = failed && failed.err && failed.err.code === 'agnes_submit_uncertain'
      ? 'agnes_submit_uncertain'
      : failed && failed.err && failed.err.providerCode
        ? `agnes_${failed.err.providerCode}`
        : 'agnes_submit_uncertain';
    return failJob(db, row, code, {
      detail: redactAgnesDetail(failed && failed.err && failed.err.providerMessage, ctx.agnes && ctx.agnes.apiKey),
      note_en: 'Video generation did not start. Please try again from Create.',
      note_zh: '视频生成没有开始。请在创作页再试一次。',
    });
  }
  if (anyHard || anyOutage) {
    const failed = created.find((item) => item && item.err && !item.videoId);
    if (failed && failed.err && failed.err.code === 'reference_photos') {
      return failReferencePhotos(db, row, prepared.template);
    }
    const code = failed && failed.err && failed.err.providerCode ? `agnes_${failed.err.providerCode}` : 'agnes_submit_uncertain';
    console.error('agnes_create', row.id, code);
    return failJob(db, row, code, {
      detail: redactAgnesDetail(failed && failed.err && failed.err.providerMessage, ctx.agnes && ctx.agnes.apiKey),
    });
  }
  const saved = await rememberSlots(ctx, row, slots);
  if (saved) return saved;
  if (anyRate) {
    const wait = agnesPollDelayMs(prepared.backoffMs);
    await noteRunningBackoff(db, row.id, `retry_later_${wait}`);
    return rateLimitResult(row, wait, false);
  }
  return { id: row.id, status: 'running', action: 'submitted', task_id: row.provider_task_id, provider: 'agnes' };
}

async function submitAgnes(ctx, row, prepared) {
  const segments = prepared.selection && prepared.selection.segments;
  if (segments && segments.length > 1) return submitAgnesParallel(ctx, row, prepared);
  return submitAgnesSegment(ctx, row, prepared, 0);
}

async function submitRouted(ctx, row, prepared) {
  if (!plannedReferenceImages(prepared.template, prepared.selection.provider)) {
    return failReferencePhotos(ctx.db, row, prepared.template);
  }
  if (prepared.selection.provider === 'agnes') {
    const agnesResult = await submitAgnes(ctx, row, prepared);
    if (agnesResult && agnesResult.fallback) {
      if (prepared.pipeline) {
        return failJob(ctx.db, row, 'failed', {
          note_en: 'This clip could not be started. The credits were returned.',
          note_zh: '这条短片没有开始。积分已退回。',
        });
      }
      if (!plannedReferenceImages(prepared.template, 'bailian')) {
        return failReferencePhotos(ctx.db, row, prepared.template);
      }
      if (!ctx.runtime || !ctx.runtime.configured) return failJob(ctx.db, row, 'failed');
      return submitBailian(ctx, row, prepared);
    }
    return agnesResult;
  }
  return submitBailian(ctx, row, prepared);
}

async function preparePipeline(ctx, row, template) {
  const pack = getPack(template.packId);
  if (!pack) return failJob(ctx.db, row, 'bad_template');
  const photoCount = storedPhotoCount(row);
  if (photoCount < (template.minPhotos || 1)) return failJob(ctx.db, row, 'no_photo');
  const view = { ...template, photoCount };
  if (!plannedReferenceImages(view, 'agnes')) return failReferencePhotos(ctx.db, row, view);
  let images;
  try {
    images = await readSubjects(ctx.bucket, row, photoCount);
  } catch (err) {
    const code = err && err.code ? err.code : 'no_photo';
    if (code === 'reference_photos') return failReferencePhotos(ctx.db, row, view);
    if (code === 'photo_too_large' || code === 'no_photo' || code === 'storage_error') return failJob(ctx.db, row, code);
    throw err;
  }
  const selection = chooseProvider(ctx, view, images, new Uint8Array());
  if (!selection || selection.provider !== 'agnes') {
    if (images.some((image) => image.bytes.byteLength > BAILIAN_IMAGE_MAX_BYTES)) {
      return failJob(ctx.db, row, 'photo_too_large');
    }
    return failJob(ctx.db, row, 'failed', {
      note_en: 'This clip could not be started. The credits were returned.',
      note_zh: '这条短片没有开始。积分已退回。',
    });
  }
  let adapted;
  try {
    adapted = adaptPack(pack, pipelineImages(template, row));
    formatAgnesCreatePayload(
      adapted,
      adapted.images.map((_, index) => `https://example.invalid/${index}`),
    );
  } catch (err) {
    return failJob(ctx.db, row, err && err.code === 'lead_required' ? 'no_photo' : 'failed');
  }
  const segments = adapted.segments.map((segment) => ({
    index: segment.index,
    start: segment.start,
    end: segment.end,
    seconds: segment.seconds,
    prompt: segment.prompt,
  }));
  const claimed = await claimQueuedJob(ctx.db, row.id);
  if (!claimed) return { id: row.id, status: 'running', action: 'busy' };
  const previous = /^retry_later_(\d+)$/.exec(row.error_code || '');
  return submitRouted(ctx, row, {
    image: images[0],
    images,
    reference: null,
    template: view,
    photoCount,
    pipeline: true,
    selection: { ...selection, segments, seconds: segments[0].seconds },
    seconds: segments[0].seconds,
    backoffMs: previous ? Number(previous[1]) : 0,
  });
}

async function prepareQueued(ctx, row) {
  const hold = retryHoldMs(row, ctx.nowMs);
  if (hold) {
    return { id: row.id, status: 'queued', action: 'retry', error: 'retry_later', retry_after_ms: hold };
  }
  const template = getTemplate(row.template_slug);
  if (!template) return failJob(ctx.db, row, 'bad_template');
  if (template.retired) {
    return failJob(ctx.db, row, 'template_retired', {
      note_en: 'This look is no longer offered. The credits were returned.',
      note_zh: '这个效果已经不再提供。积分已退回。',
    });
  }
  if (template.packId) return preparePipeline(ctx, row, template);
  if (!template.referenceVideo) return failJob(ctx.db, row, 'no_reference_video');
  if (!referencePhotoKinds(template.photoCount)) return failReferencePhotos(ctx.db, row, template);
  if (!row.upload_key || (template.photoCount > 1 && !row.upload_key_2)) {
    if (template.photoCount === 2) {
      return failJob(ctx.db, row, 'no_photo', {
        note_en: `${template.name} needs two saved photos. This job has no photo, so a clip cannot be generated.`,
        note_zh: `${template.nameZh} 需要两张已保存的照片。这个任务没有照片，无法生成短片。`,
      });
    }
    return failJob(ctx.db, row, 'no_photo');
  }
  let images;
  try {
    images = await readSubjects(ctx.bucket, row, template.photoCount);
  } catch (err) {
    const code = err && err.code ? err.code : 'no_photo';
    if (code === 'reference_photos') return failReferencePhotos(ctx.db, row, template);
    if (code === 'no_photo' && template.photoCount === 2) {
      return failJob(ctx.db, row, 'no_photo', {
        note_en: `${template.name} needs two saved photos. This job has no photo, so a clip cannot be generated.`,
        note_zh: `${template.nameZh} 需要两张已保存的照片。这个任务没有照片，无法生成短片。`,
      });
    }
    if (code === 'photo_too_large' || code === 'no_photo' || code === 'storage_error') return failJob(ctx.db, row, code);
    throw err;
  }
  const image = images[0];
  let reference;
  try {
    reference = await loadReferenceVideo(ctx.env, ctx.origin, template.referenceVideo, ctx.fetchImpl);
  } catch (err) {
    if (err && err.code === 'reference_fetch') {
      return { id: row.id, status: 'queued', action: 'retry', error: 'reference_fetch' };
    }
    return failJob(ctx.db, row, 'no_reference_video');
  }
  const selection = chooseProvider(ctx, template, images, reference);
  if (!plannedReferenceImages(template, selection.provider)) return failReferencePhotos(ctx.db, row, template);
  if (selection.provider === 'bailian' && image.bytes.byteLength > BAILIAN_IMAGE_MAX_BYTES) {
    return failJob(ctx.db, row, 'photo_too_large');
  }
  const previous = /^retry_later_(\d+)$/.exec(row.error_code || '');
  const claimed = await claimQueuedJob(ctx.db, row.id);
  if (!claimed) return { id: row.id, status: 'running', action: 'busy' };
  return submitRouted(ctx, row, {
    image,
    images,
    reference,
    template,
    selection,
    seconds: selection.seconds,
    backoffMs: previous ? Number(previous[1]) : 0,
  });
}

async function pollRunning(ctx, row) {
  const { db } = ctx;
  if (!row.provider_task_id) {
    const resumed = await resumeSplit(ctx, row);
    if (resumed) return resumed;
    if (ageMs(row.updated_at, ctx.nowMs) < SUBMIT_STALE_MS) {
      return { id: row.id, status: 'running', action: 'busy' };
    }
    // A Bailian task might already exist even though this row never saved
    // its id. Requeue only while that id is still empty so a later drain
    // can submit again. Do not assume the task is absent. The unique
    // provider_task_id guard and SUBMIT_STALE_MS are the main protections.
    const reverted = await revertQueuedJob(db, row.id);
    if (reverted) {
      return { id: row.id, status: 'queued', action: 'retry', error: 'submit_stale' };
    }
    return { id: row.id, status: 'running', action: 'busy' };
  }
  const hold = retryHoldMs(row, ctx.nowMs);
  if (hold) {
    return { id: row.id, status: 'running', action: 'retry_poll', error: 'retry_later', retry_after_ms: hold };
  }
  if (unpackAgnesTaskId(row.provider_task_id)) return pollAgnes(ctx, row);
  return pollBailian(ctx, row);
}

async function readPartBytes(bucket, userId, jobId, count) {
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const obj = await getMedia(bucket, partObjectKey(userId, jobId, index));
    const bytes = await readStoredBytes(obj);
    if (!bytes) break;
    parts.push(bytes);
  }
  return parts;
}

async function readPartMap(bucket, userId, jobId, count) {
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const obj = await getMedia(bucket, partObjectKey(userId, jobId, index));
    const bytes = await readStoredBytes(obj);
    parts.push(bytes || null);
  }
  return parts;
}

async function discardSplitObjects(bucket, userId, jobId, count) {
  for (let index = 0; index < count; index += 1) {
    try {
      await deleteMedia(bucket, segmentObjectKey(userId, jobId, index));
      await deleteMedia(bucket, partObjectKey(userId, jobId, index));
    } catch (err) {
      console.error('segment_discard', err && err.code ? err.code : 'error');
    }
  }
}

async function loadSplitPlan(ctx, row) {
  const template = getTemplate(row.template_slug);
  if (!template || template.retired) return null;
  if (template.packId) {
    const pack = getPack(template.packId);
    if (!pack) return null;
    const photoCount = storedPhotoCount(row);
    const images = await readSubjects(ctx.bucket, row, photoCount);
    const view = { ...template, photoCount };
    const selection = chooseProvider(ctx, view, images, new Uint8Array());
    if (!selection || selection.provider !== 'agnes') return null;
    const adapted = adaptPack(pack, pipelineImages(template, row));
    const segments = adapted.segments.map((segment) => ({
      index: segment.index,
      start: segment.start,
      end: segment.end,
      seconds: segment.seconds,
      prompt: segment.prompt,
    }));
    if (segments.length < 2) return null;
    return {
      template: view,
      reference: null,
      pipeline: true,
      photoCount,
      selection: { ...selection, segments, seconds: segments[0].seconds },
      image: images[0],
      images,
    };
  }
  if (!template.referenceVideo) return null;
  const reference = await loadReferenceVideo(ctx.env, ctx.origin, template.referenceVideo, ctx.fetchImpl);
  const images = await readSubjects(ctx.bucket, row, template.photoCount);
  const selection = chooseProvider(ctx, template, images, reference);
  if (!selection || selection.provider !== 'agnes' || !selection.segments || selection.segments.length < 2) return null;
  return { template, reference, selection, image: images[0], images };
}

async function stitchParts(ctx, row, parts) {
  let joined;
  try {
    joined = concatMp4(parts);
  } catch (err) {
    console.error('segment_join', row.id, err && err.code ? err.code : 'error');
    return failJob(ctx.db, row, 'segment_join');
  }
  const stored = await persistVideo(ctx, row, joined);
  if (stored && stored.status === 'ready') await discardSplitObjects(ctx.bucket, row.user_id, row.id, parts.length);
  if (stored && !stored.provider) stored.provider = 'agnes';
  return stored;
}

async function storeSplitPiece(ctx, row, info, videoUrl) {
  let plan;
  try {
    plan = await loadSplitPlan(ctx, row);
  } catch (err) {
    console.error('segment_plan', row.id, err && err.code ? err.code : 'error');
    return failJob(ctx.db, row, err && err.code === 'reference_fetch' ? 'no_reference_video' : 'failed');
  }
  if (!plan) return failJob(ctx.db, row, 'failed');
  let bytes;
  try {
    bytes = await downloadAgnesVideo(ctx.fetchImpl, videoUrl, VIDEO_MAX_BYTES);
  } catch (err) {
    const permanent =
      err &&
      (err.code === 'video_too_large' ||
        err.code === 'agnes_bad_result' ||
        err.rejected ||
        err.httpStatus === 404 ||
        err.httpStatus === 410);
    if (!permanent && err && (err.transient || err.code === 'agnes_error')) {
      return {
        id: row.id,
        status: 'running',
        action: 'retry_download',
        error: agnesCode(err),
        detail: redactAgnesDetail(err.providerMessage, ctx.agnes && ctx.agnes.apiKey),
        retry_after_ms: err.httpStatus === 429 ? agnesPollDelayMs(0) : 0,
        provider: 'agnes',
      };
    }
    return failJob(ctx.db, row, err && err.code === 'agnes_error' ? agnesCode(err) : (err && err.code) || 'failed');
  }
  if (!sniffMp4(bytes)) return failJob(ctx.db, row, 'bad_video');
  await putMedia(ctx.bucket, partObjectKey(row.user_id, row.id, info.index), bytes, {
    contentType: 'video/mp4',
    customMetadata: { kind: 'part', job_id: row.id },
  });
  const next = info.index + 1;
  if (next < plan.selection.segments.length) {
    const cleared = await clearProviderTask(ctx.db, row.id, row.provider_task_id);
    if (!cleared) return { id: row.id, status: 'running', action: 'busy', provider: 'agnes' };
    return submitAgnesSegment(ctx, row, { ...plan, backoffMs: 0 }, next);
  }
  const parts = await readPartBytes(ctx.bucket, row.user_id, row.id, plan.selection.segments.length);
  if (parts.length !== plan.selection.segments.length) return failJob(ctx.db, row, 'failed');
  return stitchParts(ctx, row, parts);
}

async function resumeSplit(ctx, row) {
  let head = null;
  try {
    head = await getMedia(ctx.bucket, partObjectKey(row.user_id, row.id, 0));
  } catch (err) {
    console.error('segment_resume', row.id, err && err.code ? err.code : 'error');
    return null;
  }
  if (!head) return null;
  const hold = retryHoldMs(row, ctx.nowMs);
  if (hold) {
    return { id: row.id, status: 'running', action: 'retry', error: 'retry_later', retry_after_ms: hold, provider: 'agnes' };
  }
  let plan;
  try {
    plan = await loadSplitPlan(ctx, row);
  } catch (err) {
    if (err && err.code === 'reference_fetch') {
      return { id: row.id, status: 'running', action: 'retry', error: 'reference_fetch', provider: 'agnes' };
    }
    return failJob(ctx.db, row, 'failed');
  }
  if (!plan) return failJob(ctx.db, row, 'failed');
  const parts = await readPartBytes(ctx.bucket, row.user_id, row.id, plan.selection.segments.length);
  if (parts.length >= plan.selection.segments.length) return stitchParts(ctx, row, parts);
  return submitAgnesSegment(ctx, row, { ...plan, backoffMs: 0 }, parts.length);
}

async function storeOnePart(ctx, row, index, videoUrl) {
  let bytes;
  try {
    bytes = await downloadAgnesVideo(ctx.fetchImpl, videoUrl, VIDEO_MAX_BYTES);
  } catch (err) {
    const permanent =
      err &&
      (err.code === 'video_too_large' ||
        err.code === 'agnes_bad_result' ||
        err.rejected ||
        err.httpStatus === 404 ||
        err.httpStatus === 410);
    if (!permanent && err && (err.transient || err.code === 'agnes_error')) {
      return {
        status: 'retry',
        id: row.id,
        action: 'retry_download',
        error: agnesCode(err),
        detail: redactAgnesDetail(err.providerMessage, ctx.agnes && ctx.agnes.apiKey),
        retry_after_ms: err.httpStatus === 429 ? agnesPollDelayMs(0) : 0,
        provider: 'agnes',
      };
    }
    return failJob(ctx.db, row, err && err.code === 'agnes_error' ? agnesCode(err) : (err && err.code) || 'failed');
  }
  if (!sniffMp4(bytes)) return failJob(ctx.db, row, 'bad_video');
  await putMedia(ctx.bucket, partObjectKey(row.user_id, row.id, index), bytes, {
    contentType: 'video/mp4',
    customMetadata: { kind: 'part', job_id: row.id },
  });
  return { status: 'stored', bytes };
}

async function pollAgnesParallel(ctx, row, info) {
  const { db, agnes, fetchImpl } = ctx;
  if (!agnes || !agnes.configured) {
    return {
      id: row.id,
      status: 'running',
      action: 'retry_poll',
      error: 'retry_later',
      retry_after_ms: AGNES_POLL_MIN_MS,
      provider: 'agnes',
    };
  }
  const claimed = await claimProviderPoll(db, row.id, row.updated_at, AGNES_POLL_MIN_MS);
  if (!claimed) {
    return {
      id: row.id,
      status: 'running',
      action: 'retry_poll',
      error: 'retry_later',
      retry_after_ms: AGNES_POLL_MIN_MS,
      provider: 'agnes',
    };
  }
  let plan;
  try {
    plan = await loadSplitPlan(ctx, row);
  } catch (err) {
    if (err && err.code === 'reference_fetch') {
      return { id: row.id, status: 'running', action: 'retry', error: 'reference_fetch', provider: 'agnes' };
    }
    return failJob(db, row, 'failed');
  }
  if (!plan || !plan.selection.segments || plan.selection.segments.length !== info.count) {
    return failJob(db, row, 'failed');
  }
  const parts = await readPartMap(ctx.bucket, row.user_id, row.id, info.count);
  if (parts.every(Boolean)) return stitchParts(ctx, row, parts);
  const slots = info.slots.slice();
  const missing = [];
  for (let index = 0; index < slots.length; index += 1) {
    if (!slots[index] && !parts[index]) missing.push(index);
  }
  if (missing.length) {
    const inputs = [];
    try {
      for (const index of missing) {
        const one = await segmentInputs(ctx, row, plan, plan.selection.segments[index]);
        if (!one) return failJob(db, row, 'failed');
        inputs.push(one);
      }
    } catch (err) {
      console.error('agnes_input', row.id, err && err.code ? err.code : 'error');
      return failJob(db, row, 'failed');
    }
    const created = await Promise.all(
      missing.map((index, pos) => createPiece(ctx, plan.template, inputs[pos], plan.selection.segments[index])),
    );
    let rate = false;
    for (let pos = 0; pos < missing.length; pos += 1) {
      const item = created[pos];
      if (item && item.videoId) {
        slots[missing[pos]] = item.videoId;
        continue;
      }
      if (createFailureKind(item && item.err) === 'rate') {
        rate = true;
        continue;
      }
      const code = item && item.err && item.err.providerCode ? `agnes_${item.err.providerCode}` : 'agnes_submit_uncertain';
      console.error('agnes_create', row.id, code);
      return failJob(db, row, code, {
        detail: redactAgnesDetail(item && item.err && item.err.providerMessage, agnes.apiKey),
      });
    }
    const saved = await rememberSlots(ctx, row, slots);
    if (saved) return saved;
    if (rate || slots.some((id, index) => !id && !parts[index])) {
      const previous = /^retry_later_(\d+)$/.exec(row.error_code || '');
      const wait = agnesPollDelayMs(previous ? Number(previous[1]) : 0);
      await noteRunningBackoff(db, row.id, `retry_later_${wait}`);
      return rateLimitResult(row, wait, false);
    }
  }
  const pending = [];
  for (let index = 0; index < slots.length; index += 1) {
    if (slots[index] && !parts[index]) pending.push(index);
  }
  if (!pending.length) return stitchParts(ctx, row, parts);
  const polls = await Promise.all(
    pending.map(async (index) => {
      try {
        const task = await getAgnesVideo(agnes, fetchImpl, slots[index]);
        return { index, task };
      } catch (err) {
        return { index, err };
      }
    }),
  );
  if (polls.some((item) => item.err && item.err.httpStatus === 429)) {
    const previous = /^retry_later_(\d+)$/.exec(row.error_code || '');
    const wait = agnesPollDelayMs(previous ? Number(previous[1]) : 0);
    await noteRunningBackoff(db, row.id, `retry_later_${wait}`);
    return {
      id: row.id,
      status: 'running',
      action: 'retry_poll',
      error: 'retry_later',
      retry_after_ms: wait,
      provider: 'agnes',
    };
  }
  const transient = polls.find((item) => item.err);
  if (transient) {
    console.error('agnes_poll', row.id, transient.err.providerCode || transient.err.code);
    return {
      id: row.id,
      status: 'running',
      action: 'retry_poll',
      error: agnesCode(transient.err),
      detail: redactAgnesDetail(transient.err.providerMessage, agnes.apiKey),
      retry_after_ms: AGNES_POLL_MIN_MS,
      provider: 'agnes',
    };
  }
  let stillRunning = false;
  for (const item of polls) {
    const status = String((item.task && item.task.status) || '').toLowerCase();
    if (status === 'queued' || status === 'in_progress' || !status) {
      stillRunning = true;
      continue;
    }
    if (status === 'failed') {
      const message = item.task.error && typeof item.task.error === 'object' ? item.task.error.message : item.task.error;
      console.error('agnes_task', row.id, 'failed');
      return failJob(db, row, 'agnes_failed', { detail: redactAgnesDetail(message, agnes.apiKey) });
    }
    if (status !== 'completed') {
      stillRunning = true;
      continue;
    }
    const videoUrl = typeof item.task.url === 'string' ? item.task.url : '';
    if (!videoUrl) return failJob(db, row, 'agnes_no_result');
    const stored = await storeOnePart(ctx, row, item.index, videoUrl);
    if (!stored || stored.status !== 'stored') {
      if (stored && stored.status === 'retry') {
        return {
          id: row.id,
          status: 'running',
          action: stored.action,
          error: stored.error,
          detail: stored.detail,
          retry_after_ms: stored.retry_after_ms,
          provider: 'agnes',
        };
      }
      return stored;
    }
    parts[item.index] = stored.bytes;
  }
  if (parts.every(Boolean)) return stitchParts(ctx, row, parts);
  if (stillRunning) await noteRunningBackoff(db, row.id, `retry_later_${AGNES_POLL_MIN_MS}`);
  return {
    id: row.id,
    status: 'running',
    action: 'polling',
    provider: 'agnes',
    retry_after_ms: AGNES_POLL_MIN_MS,
  };
}

async function pollAgnes(ctx, row) {
  const { db, agnes, fetchImpl } = ctx;
  const info = unpackAgnesTaskId(row.provider_task_id);
  if (info && info.parallel) return pollAgnesParallel(ctx, row, info);
  const videoId = info && info.videoId;
  if (!videoId || !agnes || !agnes.configured) {
    return {
      id: row.id,
      status: 'running',
      action: 'retry_poll',
      error: 'retry_later',
      retry_after_ms: agnesPollDelayMs(0),
      provider: 'agnes',
    };
  }
  const claimed = await claimProviderPoll(db, row.id, row.updated_at, AGNES_POLL_MIN_MS);
  if (!claimed) {
    return {
      id: row.id,
      status: 'running',
      action: 'retry_poll',
      error: 'retry_later',
      retry_after_ms: AGNES_POLL_MIN_MS,
      provider: 'agnes',
    };
  }
  let task;
  try {
    task = await getAgnesVideo(agnes, fetchImpl, videoId);
  } catch (err) {
    console.error('agnes_poll', row.id, err && err.providerCode ? err.providerCode : err && err.code);
    if (err && err.httpStatus === 429) {
      const previous = /^retry_later_(\d+)$/.exec(row.error_code || '');
      const wait = agnesPollDelayMs(previous ? Number(previous[1]) : 0);
      await noteRunningBackoff(db, row.id, `retry_later_${wait}`);
      return {
        id: row.id,
        status: 'running',
        action: 'retry_poll',
        error: 'retry_later',
        retry_after_ms: wait,
        provider: 'agnes',
      };
    }
    return {
      id: row.id,
      status: 'running',
      action: 'retry_poll',
      error: agnesCode(err),
      detail: redactAgnesDetail(err && err.providerMessage, agnes.apiKey),
      retry_after_ms: agnesPollDelayMs(0),
      provider: 'agnes',
    };
  }
  const status = String(task.status || '').toLowerCase();
  if (status === 'queued' || status === 'in_progress') {
    await noteRunningBackoff(db, row.id, `retry_later_${AGNES_POLL_MIN_MS}`);
    return {
      id: row.id,
      status: 'running',
      action: 'polling',
      task_status: status,
      retry_after_ms: AGNES_POLL_MIN_MS,
      provider: 'agnes',
    };
  }
  if (status === 'completed') {
    const videoUrl = typeof task.url === 'string' ? task.url : '';
    if (!videoUrl) return failJob(db, row, 'agnes_no_result');
    if (!info.multi) return storeAgnesSuccess(ctx, row, videoUrl);
    return storeSplitPiece(ctx, row, info, videoUrl);
  }
  if (status === 'failed') {
    const message = task.error && typeof task.error === 'object' ? task.error.message : task.error;
    console.error('agnes_task', row.id, 'failed');
    return failJob(db, row, 'agnes_failed', {
      detail: redactAgnesDetail(message, agnes.apiKey),
    });
  }
  return { id: row.id, status: 'running', action: 'polling', task_status: status || 'unknown', provider: 'agnes' };
}

async function pollBailian(ctx, row) {
  const { db, runtime, fetchImpl } = ctx;
  let task;
  try {
    task = await getAnimateTask(runtime, fetchImpl, row.provider_task_id);
  } catch (err) {
    console.error('bailian_poll', row.id, err && err.providerCode ? err.providerCode : err && err.code);
    return {
      id: row.id,
      status: 'running',
      action: 'retry_poll',
      error: err && err.providerCode ? `bailian_${err.providerCode}` : 'bailian_poll',
      detail: redactDetail(err && err.providerMessage, runtime.apiKey),
    };
  }
  const output = task && task.output ? task.output : {};
  const taskStatus = String(output.task_status || 'UNKNOWN');
  if (taskStatus === 'PENDING' || taskStatus === 'RUNNING') {
    return { id: row.id, status: 'running', action: 'polling', task_status: taskStatus };
  }
  if (taskStatus === 'SUCCEEDED') {
    const stored = await storeBailianSuccess(ctx, row, output);
    if (stored && !stored.provider) stored.provider = 'bailian';
    return stored;
  }
  const code = output.code ? `bailian_${String(output.code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}` : `bailian_${taskStatus}`;
  console.error('bailian_task', row.id, code);
  return failJob(db, row, code || 'failed', { detail: redactDetail(output.message, runtime.apiKey) });
}

async function storeBailianSuccess(ctx, row, output) {
  const videoUrl = output && output.results ? output.results.video_url : '';
  let bytes;
  try {
    bytes = await downloadResultVideo(ctx.fetchImpl, videoUrl, VIDEO_MAX_BYTES);
  } catch (err) {
    const permanent =
      err &&
      (err.code === 'video_too_large' ||
        err.code === 'bailian_bad_result' ||
        err.httpStatus === 404 ||
        err.httpStatus === 410);
    if (!permanent && err && (err.transient || err.code === 'bailian_error')) {
      return {
        id: row.id,
        status: 'running',
        action: 'retry_download',
        error: err.code === 'bailian_error' ? `bailian_${err.providerCode}` : err.code || 'download',
        detail: redactDetail(err.providerMessage, ctx.runtime.apiKey),
        provider: 'bailian',
      };
    }
    return failJob(ctx.db, row, err && err.code ? err.code : 'failed');
  }
  const stored = await persistVideo(ctx, row, bytes);
  if (stored && !stored.provider) stored.provider = 'bailian';
  return stored;
}

async function storeAgnesSuccess(ctx, row, videoUrl) {
  let bytes;
  try {
    bytes = await downloadAgnesVideo(ctx.fetchImpl, videoUrl, VIDEO_MAX_BYTES);
  } catch (err) {
    const permanent =
      err &&
      (err.code === 'video_too_large' ||
        err.code === 'agnes_bad_result' ||
        err.rejected ||
        err.httpStatus === 404 ||
        err.httpStatus === 410);
    if (!permanent && err && (err.transient || err.code === 'agnes_error')) {
      return {
        id: row.id,
        status: 'running',
        action: 'retry_download',
        error: agnesCode(err),
        detail: redactAgnesDetail(err.providerMessage, ctx.agnes && ctx.agnes.apiKey),
        retry_after_ms: err.httpStatus === 429 ? agnesPollDelayMs(0) : 0,
        provider: 'agnes',
      };
    }
    return failJob(ctx.db, row, err && err.code === 'agnes_error' ? agnesCode(err) : (err && err.code) || 'failed');
  }
  const stored = await persistVideo(ctx, row, bytes);
  if (stored && !stored.provider) stored.provider = 'agnes';
  return stored;
}

async function persistVideo(ctx, row, bytes) {
  if (!sniffMp4(bytes)) return failJob(ctx.db, row, 'bad_video');
  const finished = await decorateResult(ctx, row, bytes);
  if (finished.retry) {
    return {
      id: row.id,
      status: 'running',
      action: 'retry_download',
      error: 'reference_fetch',
    };
  }
  if (finished.fail) return failJob(ctx.db, row, finished.fail);
  bytes = finished.bytes;
  if (!sniffMp4(bytes)) return failJob(ctx.db, row, 'bad_video');
  try {
    const stored = await storeJobResult(ctx.db, ctx.env, ctx.request, row.id, {
      bytes,
      contentType: 'video/mp4',
      ext: 'mp4',
    });
    return {
      id: row.id,
      status: 'ready',
      action: 'stored',
      result_url: stored.job.result_url,
    };
  } catch (err) {
    console.error('bailian_store', row.id, err && err.code ? err.code : 'storage_error');
    if (err && (err.code === 'bad_video' || err.code === 'bad_status' || err.code === 'not_found')) {
      return failJob(ctx.db, row, err.code);
    }
    return { id: row.id, status: 'running', action: 'retry_store', error: 'storage_error' };
  }
}

async function decorateResult(ctx, row, bytes) {
  const template = getTemplate(row.template_slug);
  let music = null;
  if (template && template.referenceVideo) {
    try {
      music = await loadReferenceVideo(ctx.env, ctx.origin, template.referenceVideo, ctx.fetchImpl);
    } catch (err) {
      if (err && err.code === 'reference_fetch') return { retry: true };
      return { fail: 'no_reference_video' };
    }
  }
  if (!music || !mp4HasAudio(music) || mp4HasAudio(bytes)) return { bytes };
  try {
    return { bytes: muxStyleAudio(bytes, music) };
  } catch (err) {
    if (err && err.code === 'no_music') return { bytes };
    console.error('audio_mux', row.id, err && err.code ? err.code : 'error');
    return { fail: 'audio_mux' };
  }
}

async function processRow(ctx, row) {
  if (!row) return null;
  if (row.status === 'ready') return { id: row.id, status: 'ready', action: 'done' };
  if (row.status === 'failed') return { id: row.id, status: 'failed', action: 'done', error: row.error_code || 'failed' };
  if (row.status === 'running') return pollRunning(ctx, row);
  if (row.status === 'queued') {
    if (ctx.pollOnly) return { id: row.id, status: 'queued', action: 'left_queued' };
    return prepareQueued(ctx, row);
  }
  return { id: row.id, status: row.status, action: 'skipped' };
}

async function processOnce(ctx) {
  const rows = ctx.onlyIds
    ? (
        await Promise.all(ctx.onlyIds.map((id) => listRemakeCandidates(ctx.db, { jobId: id })))
      ).flat()
    : await listRemakeCandidates(ctx.db, {
        limit: ctx.limit,
        jobId: ctx.jobId || undefined,
        userId: ctx.userId || undefined,
      });
  if (!ctx.onlyIds && ctx.jobId && rows.length === 0) throw fail('not_found');
  const processed = [];
  for (const row of rows) {
    if (ctx.onlyIds && row.status === 'queued' && ctx.pollOnly) {
      processed.push(await processRow(ctx, row));
      continue;
    }
    processed.push(await processRow(ctx, row));
  }
  return processed.filter(Boolean);
}

function summarizeProvider(backends, processed) {
  const used = new Set((processed || []).map((row) => row && row.provider).filter(Boolean));
  let name = backends.selected;
  if (used.size === 1) name = [...used][0];
  else if (used.size > 1) name = 'mixed';
  if (name === 'agnes') {
    return {
      name: 'agnes',
      model: backends.agnes.model,
      mode: 'reference',
      base_host: new URL(backends.agnes.base).host,
    };
  }
  if (name === 'mixed') {
    return {
      name: 'mixed',
      model: backends.agnes.model,
      mode: 'reference',
      base_host: new URL(backends.agnes.base).host,
    };
  }
  return {
    name: 'bailian',
    model: backends.bailian.model,
    mode: backends.bailian.mode,
    base_host: new URL(backends.bailian.base).host,
  };
}

export async function processRemakeJobs({
  db,
  env,
  request,
  fetchImpl = fetch,
  limit = 1,
  jobId = '',
  waitMs = 0,
  pollIntervalMs = 6_000,
  sleepImpl = sleep,
  nowMs = Date.now(),
  userId = '',
}) {
  if (!mediaConfigured(env)) throw fail('r2_unbound');
  try {
    await refundOutstandingFailures(db);
  } catch (err) {
    console.error('credit_refund', err && err.code ? err.code : 'error');
  }
  const backends = videoBackends(env);
  if (!providerConfigured(backends)) throw fail('bailian_unconfigured');
  const runtime = backends.bailian;
  const bucket = env.MEDIA;
  const ctx = {
    db,
    env,
    request,
    fetchImpl,
    runtime,
    agnes: backends.agnes,
    backends,
    bucket,
    origin: requestOrigin(request),
    limit,
    jobId,
    nowMs,
    pollOnly: false,
    onlyIds: null,
    userId: typeof userId === 'string' ? userId : '',
  };
  let processed = await processOnce(ctx);
  const watched = processed.map((row) => row.id);
  const deadline = nowMs + waitMs;
  while (waitMs > 0 && Date.now() < deadline) {
    const pending = processed.some((row) => row.status === 'running' || row.action === 'retry');
    if (!pending) break;
    const backoff = processed.reduce((max, row) => Math.max(max, row && row.retry_after_ms ? row.retry_after_ms : 0), 0);
    const remaining = Math.max(0, deadline - Date.now());
    const waiting = processed.every((row) => row && (row.status === 'ready' || row.status === 'failed' || row.retry_after_ms));
    if (waiting && backoff > remaining) break;
    const delay = Math.min(Math.max(pollIntervalMs, backoff), remaining);
    if (delay > 0) await sleepImpl(delay);
    ctx.pollOnly = true;
    ctx.onlyIds = watched;
    ctx.nowMs = Date.now();
    const next = await processOnce(ctx);
    if (next.length) processed = next;
  }
  return {
    provider: summarizeProvider(backends, processed),
    processed,
  };
}
