/**
 * Store Create photos and finished MP4s.
 * Queueing a job does not call a video provider and does not mark it ready.
 * A clip is downloadable only after bytes are written to R2 and the job row
 * is updated (see POST /api/jobs/:id/result).
 */

import { attachJobResult, createStubJob, ensureUser, fail, getJobMediaRecord, newId } from './account-db.js';
import {
  RESULT_LINK_TTL_SEC,
  deleteMedia,
  expiresAtIso,
  getMedia,
  imageFromDataUrl,
  mediaConfigured,
  mediaDownloadUrl,
  objectExpired,
  photoObjectKey,
  putMedia,
  requestOrigin,
  resultObjectKey,
  retentionDays,
  signMediaQuery,
  sniffImage,
  sniffMp4,
  verifyMediaQuery,
  videoFromDataUrl,
  PHOTO_MAX_BYTES,
  VIDEO_MAX_BYTES,
  MEDIA_KINDS,
} from './r2-media.js';
import { readSession, resolveAuthSecret } from './session.js';
import { getTemplate } from './templates.js';

function mediaSecret(env, request) {
  const host = new URL(request.url).hostname;
  return resolveAuthSecret(env, host).secret;
}

async function signedDownloadUrl(env, request, jobId, kind, ttlSec) {
  const origin = requestOrigin(request);
  const secret = mediaSecret(env, request);
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  if (!secret) return mediaDownloadUrl(origin, jobId, kind, null);
  const query = await signMediaQuery(secret, { jobId, kind, exp });
  return mediaDownloadUrl(origin, jobId, kind, query);
}

async function discard(bucket, keys) {
  for (const key of keys) {
    try {
      await deleteMedia(bucket, key);
    } catch (err) {
      console.error('r2_discard', key, err && err.code ? err.code : 'error');
    }
  }
}

function photoMeta(userId, jobId, days) {
  return {
    kind: 'upload',
    user_id: userId,
    job_id: jobId,
    retention_days: String(days),
    expires_at: expiresAtIso(days),
  };
}

export async function readCreateJobBody(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    let body;
    try {
      body = await request.json();
    } catch {
      throw fail('bad_json');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('bad_json');
    const photos = [];
    const list = [];
    if (Array.isArray(body.photos)) list.push(...body.photos);
    else if (typeof body.photo === 'string') list.push(body.photo);
    if (list.length > 2) throw fail('bad_photo');
    for (const item of list) photos.push(imageFromDataUrl(item));
    return { template_slug: body.template_slug, photos };
  }
  if (type.includes('multipart/form-data')) {
    let form;
    try {
      form = await request.formData();
    } catch {
      throw fail('bad_json');
    }
    const slug = form.get('template_slug');
    if (typeof slug !== 'string') throw fail('bad_template');
    const photos = [];
    for (const slot of [0, 1]) {
      const raw = form.get(`photo_${slot}`) || (slot === 0 ? form.get('photo') : null);
      if (raw == null) continue;
      if (photos.length !== slot) throw fail('bad_photo');
      if (typeof raw === 'string' || typeof raw.arrayBuffer !== 'function') throw fail('bad_photo');
      if (typeof raw.size === 'number' && raw.size > PHOTO_MAX_BYTES) throw fail('photo_too_large');
      const bytes = new Uint8Array(await raw.arrayBuffer());
      const sniffed = sniffImage(bytes);
      if (!sniffed) {
        if (bytes.byteLength > PHOTO_MAX_BYTES) throw fail('photo_too_large');
        throw fail('bad_photo');
      }
      photos.push({ bytes, contentType: sniffed.contentType, ext: sniffed.ext });
    }
    return { template_slug: slug, photos };
  }
  throw fail('bad_json');
}

/**
 * Queue a job. Photos are stored only when the MEDIA binding is present.
 * Missing binding: job still queues, media.error is r2_unbound when photos were sent.
 */
export async function queueJobWithMedia({ db, env, request, user, templateSlug, photos }) {
  const template = getTemplate(templateSlug);
  if (!template) throw fail('bad_template');
  const incoming = Array.isArray(photos) ? photos : [];
  if (incoming.length > 2) throw fail('bad_photo');
  if (incoming.length && incoming.length !== template.photoCount) throw fail('bad_photo');
  const prepared = incoming.map((photo) => {
    const sniffed = sniffImage(photo.bytes);
    if (!sniffed) throw fail('bad_photo');
    return { bytes: photo.bytes, contentType: sniffed.contentType, ext: sniffed.ext };
  });

  const bucket = getMediaBucketSafe(env);
  if (!prepared.length || !bucket) {
    const job = await createStubJob(db, user, template.slug);
    const media = { stored: false, r2_configured: Boolean(bucket), photos: 0 };
    if (prepared.length && !bucket) media.error = 'r2_unbound';
    return { job, media };
  }

  const owner = await ensureUser(db, user);
  const id = newId('job');
  const days = retentionDays(env).photo;
  const ttl = days * 86400;
  const keys = [];
  try {
    const stored = [];
    for (let slot = 0; slot < prepared.length; slot += 1) {
      const photo = prepared[slot];
      const key = photoObjectKey(owner.user_id, id, slot, photo.ext);
      await putMedia(bucket, key, photo.bytes, {
        contentType: photo.contentType,
        customMetadata: photoMeta(owner.user_id, id, days),
      });
      keys.push(key);
      const kind = slot === 0 ? 'photo' : 'photo-2';
      stored.push({ key, url: await signedDownloadUrl(env, request, id, kind, ttl) });
    }
    const job = await createStubJob(db, owner, template.slug, {
      id,
      upload_key: stored[0].key,
      upload_url: stored[0].url,
      upload_key_2: stored[1] ? stored[1].key : null,
      upload_url_2: stored[1] ? stored[1].url : null,
    });
    return {
      job,
      media: { stored: true, r2_configured: true, photos: stored.length },
    };
  } catch (err) {
    await discard(bucket, keys);
    if (err && err.code) throw err;
    throw fail('storage_error');
  }
}

function getMediaBucketSafe(env) {
  return mediaConfigured(env) ? env.MEDIA : null;
}

export function resultUrlSigner(env, request) {
  const secret = mediaSecret(env, request);
  if (!secret) return null;
  const origin = requestOrigin(request);
  return async (row) => {
    const exp = Math.floor(Date.now() / 1000) + RESULT_LINK_TTL_SEC;
    const query = await signMediaQuery(secret, { jobId: String(row.id), kind: 'result', exp });
    return mediaDownloadUrl(origin, String(row.id), 'result', query);
  };
}

export async function readResultBody(request) {
  const type = request.headers.get('content-type') || '';
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > VIDEO_MAX_BYTES) throw fail('video_too_large');
  if (type.includes('application/json')) {
    let body;
    try {
      body = await request.json();
    } catch {
      throw fail('bad_json');
    }
    if (!body || typeof body !== 'object') throw fail('bad_json');
    const raw = body.video_data_url || body.video || body.data_url;
    return videoFromDataUrl(raw);
  }
  if (type.includes('multipart/form-data')) {
    let form;
    try {
      form = await request.formData();
    } catch {
      throw fail('bad_json');
    }
    const raw = form.get('video') || form.get('file');
    if (!raw || typeof raw === 'string' || typeof raw.arrayBuffer !== 'function') throw fail('bad_video');
    if (typeof raw.size === 'number' && raw.size > VIDEO_MAX_BYTES) throw fail('video_too_large');
    const bytes = new Uint8Array(await raw.arrayBuffer());
    const sniffed = sniffMp4(bytes);
    if (!sniffed) throw fail(bytes.byteLength > VIDEO_MAX_BYTES ? 'video_too_large' : 'bad_video');
    return { bytes, contentType: sniffed.contentType, ext: sniffed.ext };
  }
  if (type.startsWith('video/mp4') || type.startsWith('application/octet-stream')) {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const sniffed = sniffMp4(bytes);
    if (!sniffed) throw fail(bytes.byteLength > VIDEO_MAX_BYTES ? 'video_too_large' : 'bad_video');
    return { bytes, contentType: 'video/mp4', ext: 'mp4' };
  }
  throw fail('bad_video');
}

/**
 * Write an MP4 into R2 and point the job at a signed download URL.
 * Does not call fal, Kling, or any other generator.
 */
export async function storeJobResult(db, env, request, jobId, video) {
  const bucket = getMediaBucketSafe(env);
  if (!bucket) throw fail('r2_unbound');
  const sniffed = sniffMp4(video && video.bytes);
  if (!sniffed) throw fail('bad_video');
  const record = await getJobMediaRecord(db, jobId);
  if (!record) throw fail('not_found');
  if (record.status === 'failed') throw fail('bad_status');
  const key = resultObjectKey(record.user_id, record.id);
  const days = retentionDays(env).video;
  await putMedia(bucket, key, video.bytes, {
    contentType: sniffed.contentType,
    customMetadata: {
      kind: 'result',
      user_id: record.user_id,
      job_id: record.id,
      retention_days: String(days),
      expires_at: expiresAtIso(days),
    },
  });
  const result_url = await signedDownloadUrl(env, request, record.id, 'result', days * 86400);
  // Key is deterministic. A failed row update leaves the object for the next ingest to overwrite.
  return attachJobResult(db, record.id, { result_key: key, result_url });
}

export function ingestAuthorized(env, request) {
  const secret = typeof env?.RESULT_INGEST_SECRET === 'string' ? env.RESULT_INGEST_SECRET.trim() : '';
  if (secret.length < 16) return 'unconfigured';
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match || !safeEqualString(match[1], secret)) return 'unauthorized';
  return 'ok';
}

function safeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function authorizeMediaRequest(env, request, record, kind) {
  if (!MEDIA_KINDS.has(kind)) throw fail('not_found');
  const user = await readSession(request, env);
  if (user && user.user_id === record.user_id) return 'owner';
  const url = new URL(request.url);
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  if (exp || sig) {
    const secret = mediaSecret(env, request);
    const ok = Boolean(secret) && (await verifyMediaQuery(secret, { jobId: record.id, kind, exp, sig }));
    if (ok) return 'signed';
    throw fail('forbidden');
  }
  if (!user) throw fail('unauthorized');
  throw fail('not_found');
}

export function keyForKind(record, kind) {
  if (kind === 'photo') return record.upload_key || null;
  if (kind === 'photo-2') return record.upload_key_2 || null;
  if (kind === 'result') {
    if (record.status !== 'ready') return null;
    return record.result_key || null;
  }
  return null;
}

export async function loadStoredObject(bucket, key) {
  const obj = await getMedia(bucket, key);
  if (!obj) return null;
  if (objectExpired(obj.customMetadata)) {
    try {
      await deleteMedia(bucket, key);
    } catch (err) {
      console.error('r2_expire', err && err.code ? err.code : 'error');
    }
    return null;
  }
  return obj;
}
