/**
 * Private media in one R2 bucket (binding MEDIA, bucket viral-templates-media).
 *
 * Keys:
 *   uploads/{userId}/{jobId}/0.jpg|png|webp   face photo (slot 1 is /1.ext)
 *   results/{userId}/{jobId}.mp4              finished clip
 *   templates/                                reserved; this module does not write it
 *
 * The bucket stays private (no r2.dev public URL). Downloads are app URLs:
 *   /api/media/jobs/{jobId}/{photo|photo-2|result}?exp=&sig=
 * sig is HMAC-SHA256 over the job, kind, and expiry, using AUTH_SECRET.
 *
 * Retention defaults: photos 7 days, videos 30 days (PHOTO_RETENTION_DAYS /
 * VIDEO_RETENTION_DAYS, or the PUBLIC_* copies). The binding cannot set R2
 * lifecycle rules. Put those on the bucket (docs/r2-media.md). Object metadata
 * expires_at is a hint; reads delete an object after that instant, which does
 * not replace the bucket lifecycle rule.
 */

export const BUCKET_NAME = 'viral-templates-media';
export const BINDING_NAME = 'MEDIA';

export const PHOTO_RETENTION_DAYS = 7;
export const VIDEO_RETENTION_DAYS = 30;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 64 * 1024 * 1024;
export const MIN_MEDIA_BYTES = 32;
/** Fresh signature on account listings. Owner cookies still open an older link. */
export const RESULT_LINK_TTL_SEC = 60 * 60;
export const MAX_RETENTION_DAYS = 365;

export const MEDIA_KINDS = new Set(['photo', 'photo-2', 'result']);

const text = new TextEncoder();

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

export function mediaConfigured(env) {
  return Boolean(getMediaBucket(env));
}

export function getMediaBucket(env) {
  const bucket = env && env[BINDING_NAME];
  if (!bucket || typeof bucket.put !== 'function' || typeof bucket.get !== 'function') return null;
  if (typeof bucket.delete !== 'function') return null;
  return bucket;
}

export function clampRetentionDays(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_RETENTION_DAYS) return fallback;
  return n;
}

export function retentionDays(env) {
  const source = env || {};
  return {
    photo: clampRetentionDays(source.PHOTO_RETENTION_DAYS ?? source.PUBLIC_PHOTO_RETENTION_DAYS, PHOTO_RETENTION_DAYS),
    video: clampRetentionDays(source.VIDEO_RETENTION_DAYS ?? source.PUBLIC_VIDEO_RETENTION_DAYS, VIDEO_RETENTION_DAYS),
  };
}

export function expiresAtIso(days, nowMs = Date.now()) {
  return new Date(nowMs + days * 86400000).toISOString();
}

export function objectExpired(customMetadata, nowMs = Date.now()) {
  const raw = customMetadata && customMetadata.expires_at;
  if (!raw) return false;
  const at = Date.parse(String(raw));
  return Number.isFinite(at) && at <= nowMs;
}

function isSafeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

export function photoObjectKey(userId, jobId, slot, ext) {
  if (!isSafeId(userId) || !isSafeId(jobId)) throw fail('storage_error');
  if (slot !== 0 && slot !== 1) throw fail('bad_photo');
  if (ext !== 'jpg' && ext !== 'png' && ext !== 'webp') throw fail('bad_photo');
  return `uploads/${userId}/${jobId}/${slot}.${ext}`;
}

export function resultObjectKey(userId, jobId) {
  if (!isSafeId(userId) || !isSafeId(jobId)) throw fail('storage_error');
  return `results/${userId}/${jobId}.mp4`;
}

export function assertObjectKey(key) {
  if (typeof key !== 'string' || key.length > 240 || key.includes('..') || key.includes('\\')) {
    throw fail('storage_error');
  }
  const photo = /^uploads\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[01]\.(jpg|png|webp)$/;
  const video = /^results\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.mp4$/;
  if (!photo.test(key) && !video.test(key)) throw fail('storage_error');
  return key;
}

export function sniffImage(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < MIN_MEDIA_BYTES || bytes.byteLength > PHOTO_MAX_BYTES) {
    return null;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: 'image/jpeg', ext: 'jpg' };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { contentType: 'image/png', ext: 'png' };
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: 'image/webp', ext: 'webp' };
  }
  return null;
}

export function sniffMp4(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < MIN_MEDIA_BYTES || bytes.byteLength > VIDEO_MAX_BYTES) {
    return null;
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { contentType: 'video/mp4', ext: 'mp4' };
  }
  return null;
}

function decodeBase64(clean) {
  if (!clean || clean.length % 4 === 1) throw fail('bad_photo');
  let bin;
  try {
    bin = atob(clean);
  } catch {
    throw fail('bad_photo');
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function imageFromDataUrl(value) {
  if (typeof value !== 'string') throw fail('bad_photo');
  const trimmed = value.trim();
  if (trimmed.length > Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 64) throw fail('photo_too_large');
  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([a-zA-Z0-9+/=\r\n]+)$/i.exec(trimmed);
  if (!match) throw fail('bad_photo');
  const bytes = decodeBase64(match[1].replace(/\s/g, ''));
  const sniffed = sniffImage(bytes);
  if (!sniffed) {
    if (bytes.byteLength > PHOTO_MAX_BYTES) throw fail('photo_too_large');
    throw fail('bad_photo');
  }
  return { bytes, contentType: sniffed.contentType, ext: sniffed.ext };
}

export function videoFromDataUrl(value) {
  if (typeof value !== 'string') throw fail('bad_video');
  const trimmed = value.trim();
  if (trimmed.length > Math.ceil((VIDEO_MAX_BYTES * 4) / 3) + 64) throw fail('video_too_large');
  const match = /^data:video\/mp4;base64,([a-zA-Z0-9+/=\r\n]+)$/i.exec(trimmed);
  if (!match) throw fail('bad_video');
  let bytes;
  try {
    bytes = decodeBase64(match[1].replace(/\s/g, ''));
  } catch (err) {
    if (err && err.code === 'bad_photo') throw fail('bad_video');
    throw err;
  }
  const sniffed = sniffMp4(bytes);
  if (!sniffed) {
    if (bytes.byteLength > VIDEO_MAX_BYTES) throw fail('video_too_large');
    throw fail('bad_video');
  }
  return { bytes, contentType: sniffed.contentType, ext: sniffed.ext };
}

export async function putMedia(bucket, key, bytes, meta) {
  assertObjectKey(key);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < MIN_MEDIA_BYTES) throw fail('storage_error');
  const contentType = meta && meta.contentType;
  if (typeof contentType !== 'string' || !contentType) throw fail('storage_error');
  await bucket.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: meta.customMetadata || {},
  });
}

export async function getMedia(bucket, key) {
  assertObjectKey(key);
  const obj = await bucket.get(key);
  return obj || null;
}

export async function deleteMedia(bucket, key) {
  if (!key) return;
  assertObjectKey(key);
  await bucket.delete(key);
}

export function requestOrigin(request) {
  return new URL(request.url).origin;
}

function mediaMessage(jobId, kind, expStr) {
  return `v1\n${jobId}\n${kind}\n${expStr}`;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', text.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, text.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function signMediaQuery(secret, { jobId, kind, exp }) {
  if (!secret || String(secret).length < 16) throw fail('storage_error');
  if (!isSafeId(jobId) || !MEDIA_KINDS.has(kind)) throw fail('storage_error');
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum <= 0) throw fail('storage_error');
  const expStr = String(expNum);
  const sig = await hmacHex(secret, mediaMessage(jobId, kind, expStr));
  return { exp: expNum, sig };
}

export async function verifyMediaQuery(secret, { jobId, kind, exp, sig }, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || String(secret).length < 16) return false;
  if (!isSafeId(jobId) || !MEDIA_KINDS.has(kind)) return false;
  if (typeof exp !== 'string' || !/^[1-9][0-9]{0,11}$/.test(exp)) return false;
  if (typeof sig !== 'string' || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const expNum = Number(exp);
  if (expNum < nowSec || expNum > nowSec + (MAX_RETENTION_DAYS + 1) * 86400) return false;
  const expected = await hmacHex(secret, mediaMessage(jobId, kind, exp));
  return safeEqual(expected, sig);
}

export function mediaDownloadUrl(origin, jobId, kind, query) {
  if (!isSafeId(jobId) || !MEDIA_KINDS.has(kind)) throw fail('storage_error');
  const url = new URL(`/api/media/jobs/${jobId}/${kind}`, origin);
  if (query) {
    url.searchParams.set('exp', String(query.exp));
    url.searchParams.set('sig', query.sig);
  }
  return url.toString();
}
