/**
 * Process queued remake jobs through Bailian wan2.2-animate-move.
 *
 * One pass submits new tasks and polls tasks already running. Video generation
 * takes minutes. Create starts a pass with waitUntil. Pages Functions have
 * no cron, so workers/job-drain posts /api/jobs/process every two minutes,
 * and the signed-in account page can post /api/jobs/continue. Ops can still
 * repeat POST /api/jobs/process (see scripts/smoke-bailian.mjs). wait_ms can
 * poll inside one request for a short window.
 *
 * Subject image is R2 upload_key (slot 0). wan2.2-animate-move takes one image.
 * Kiss Cam's second photo stays in R2 and is not sent.
 * The reference clip is the template demo MP4, read from the Pages ASSETS
 * binding (or this deployment). Both files are uploaded to DashScope temporary
 * storage. image_url and video_url sent to Bailian are oss:// only.
 * Never pass *.pages.dev, *.workers.dev, or *.r2.dev. Aliyun cannot fetch them
 * (InvalidURL.ConnectionRefused). upload_url is a signed pages.dev link for
 * the account UI and is not a Bailian input.
 */

import {
  claimQueuedJob,
  fail,
  listRemakeCandidates,
  markJobFailed,
  revertQueuedJob,
  saveProviderTask,
} from './account-db.js';
import {
  BAILIAN_IMAGE_MAX_BYTES,
  bailianRuntime,
  downloadResultVideo,
  getAnimateTask,
  redactDetail,
  submitAnimateMove,
  uploadTempFile,
} from './bailian.js';
import { getTemplate } from './templates.js';
import { storeJobResult } from './job-media.js';
import { getMedia, mediaConfigured, requestOrigin, sniffImage, sniffMp4, VIDEO_MAX_BYTES } from './r2-media.js';

const SUBMIT_STALE_MS = 2 * 60 * 1000;

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
  submit_interrupted: {
    en: 'Video generation did not start. Please try again from Create.',
    zh: '视频生成没有开始。请在创作页再试一次。',
  },
  failed: {
    en: 'Video generation failed. Please try again from Create.',
    zh: '视频生成失败。请在创作页再试一次。',
  },
};

function noteFor(code) {
  return NOTES[code] || NOTES.failed;
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

async function submitClaimed(ctx, row, prepared) {
  const { db, runtime, fetchImpl } = ctx;
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
    return { id: row.id, status: 'running', action: 'submitted', task_id: submitted.taskId };
  } catch (err) {
    const code = err && err.providerCode ? `bailian_${err.providerCode}` : 'bailian_submit_uncertain';
    console.error('bailian_synthesis', row.id, code);
    return failJob(db, row, code, {
      detail: redactDetail(err && err.providerMessage, runtime.apiKey),
      note_en: 'Video generation did not start. Please try again from Create.',
      note_zh: '视频生成没有开始。请在创作页再试一次。',
    });
  }
}

async function readSubject(bucket, row) {
  if (!row.upload_key) throw fail('no_photo');
  const obj = await getMedia(bucket, row.upload_key);
  const bytes = await readStoredBytes(obj);
  const sniffed = sniffImage(bytes);
  if (!sniffed) throw fail('no_photo');
  if (bytes.byteLength > BAILIAN_IMAGE_MAX_BYTES) throw fail('photo_too_large');
  return { bytes, contentType: sniffed.contentType, filename: `subject.${sniffed.ext}` };
}

async function prepareQueued(ctx, row) {
  const template = getTemplate(row.template_slug);
  if (!template || !template.referenceVideo) return failJob(ctx.db, row, 'no_reference_video');
  if (!row.upload_key) {
    if (template.photoCount === 2) {
      return failJob(ctx.db, row, 'no_photo', {
        note_en: `${template.name} needs two saved photos. This job has no photo, so a clip cannot be generated.`,
        note_zh: `${template.nameZh} 需要两张已保存的照片。这个任务没有照片，无法生成短片。`,
      });
    }
    return failJob(ctx.db, row, 'no_photo');
  }
  let image;
  try {
    // Slot 0 only. wan2.2-animate-move takes one subject image.
    image = await readSubject(ctx.bucket, row);
  } catch (err) {
    const code = err && err.code ? err.code : 'no_photo';
    if (code === 'photo_too_large' || code === 'no_photo' || code === 'storage_error') return failJob(ctx.db, row, code);
    throw err;
  }
  let reference;
  try {
    reference = await loadReferenceVideo(ctx.env, ctx.origin, template.referenceVideo, ctx.fetchImpl);
  } catch (err) {
    if (err && err.code === 'reference_fetch') {
      return { id: row.id, status: 'queued', action: 'retry', error: 'reference_fetch' };
    }
    return failJob(ctx.db, row, 'no_reference_video');
  }
  const claimed = await claimQueuedJob(ctx.db, row.id);
  if (!claimed) return { id: row.id, status: 'running', action: 'busy' };
  return submitClaimed(ctx, row, { image, reference });
}

async function pollRunning(ctx, row) {
  const { db, runtime, fetchImpl } = ctx;
  if (!row.provider_task_id) {
    if (ageMs(row.updated_at, ctx.nowMs) < SUBMIT_STALE_MS) {
      return { id: row.id, status: 'running', action: 'busy' };
    }
    return failJob(db, row, 'submit_interrupted');
  }
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
    return storeSuccess(ctx, row, output);
  }
  const code = output.code ? `bailian_${String(output.code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}` : `bailian_${taskStatus}`;
  console.error('bailian_task', row.id, code);
  return failJob(db, row, code || 'failed', { detail: redactDetail(output.message, runtime.apiKey) });
}

async function storeSuccess(ctx, row, output) {
  const videoUrl = output && output.results ? output.results.video_url : '';
  let bytes;
  try {
    const safeUrl = videoUrl;
    bytes = await downloadResultVideo(ctx.fetchImpl, safeUrl, VIDEO_MAX_BYTES);
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
      };
    }
    return failJob(ctx.db, row, err && err.code ? err.code : 'failed');
  }
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

export async function processRemakeJobs({
  db,
  env,
  request,
  fetchImpl = fetch,
  limit = 1,
  jobId = '',
  waitMs = 0,
  pollIntervalMs = 15_000,
  sleepImpl = sleep,
  nowMs = Date.now(),
  userId = '',
}) {
  if (!mediaConfigured(env)) throw fail('r2_unbound');
  const runtime = bailianRuntime(env);
  if (!runtime.configured) throw fail('bailian_unconfigured');
  const bucket = env.MEDIA;
  const ctx = {
    db,
    env,
    request,
    fetchImpl,
    runtime,
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
    const delay = Math.min(pollIntervalMs, deadline - Date.now());
    if (delay > 0) await sleepImpl(delay);
    ctx.pollOnly = true;
    ctx.onlyIds = watched;
    ctx.nowMs = Date.now();
    const next = await processOnce(ctx);
    if (next.length) processed = next;
  }
  return {
    provider: {
      model: runtime.model,
      mode: runtime.mode,
      base_host: new URL(runtime.base).host,
    },
    processed,
  };
}
