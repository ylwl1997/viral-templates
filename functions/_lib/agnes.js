/**
 * HTTP client for Agnes Video 2.5 reference mode (photo + template video).
 * China host. Create POST {base}/videos, then poll GET {origin}/agnesapi.
 * Docs: https://wiki.agnes-ai.cn/zh-Hans/docs/agnes-video-25
 *
 * Inputs must be public https URLs on the custom domain. This module never
 * sends *.pages.dev, *.workers.dev, or *.r2.dev. Completion is `status`
 * completed or failed. `internal_status` is ignored. The file is the
 * top-level `url`.
 */

import { fail } from './account-db.js';
import { mediaDownloadUrl, signMediaQuery } from './r2-media.js';
import { resolveAuthSecret } from './session.js';

export const AGNES_MODEL = 'agnes-video-2.5';
export const DEFAULT_AGNES_BASE = 'https://api.agnes-ai.cn/v1';
export const AGNES_SIZE = '720P';
export const AGNES_ASPECT_RATIO = '9:16';
export const AGNES_TASK_PREFIX = 'agn_';
export const AGNES_INPUT_TTL_SEC = 24 * 60 * 60;
export const AGNES_POLL_MIN_MS = 6_000;
export const AGNES_POLL_MAX_MS = 60_000;

/** Reference file limits from the Video 2.5 docs. Output seconds are only "4"–"12". */
export const AGNES_VIDEO_MIN_SECONDS = 2;
export const AGNES_VIDEO_MAX_SECONDS = 12;
export const AGNES_OUTPUT_MIN_SECONDS = 4;
export const AGNES_OUTPUT_MAX_SECONDS = 12;
export const AGNES_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const AGNES_FPS_MIN = 24;
export const AGNES_FPS_MAX = 60;
export const AGNES_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const AGNES_IMAGE_MIN_SIDE = 256;
export const AGNES_IMAGE_MAX_SIDE = 5760;

/**
 * Trial prompt. Placeholders are 1-based in each media array.
 * Keep the template motion and replace only the person.
 */
export const REFERENCE_PROMPT =
  'Use <Image 1> as the person and follow <Video 1> motion/camera/timing/scene; keep the template setting and outfits; replace only the identity; photorealistic.';

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

export function normalizeAgnesBase(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw fail('agnes_bad_base');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('agnes_bad_base');
  url.search = '';
  url.hash = '';
  let path = url.pathname.replace(/\/+$/, '');
  if (path === '' || path === '/') path = '/v1';
  url.pathname = path;
  return url.toString().replace(/\/$/, '');
}

export function resolveAgnesBase(env) {
  const raw = env && typeof env.AGNES_BASE_URL === 'string' ? env.AGNES_BASE_URL.trim() : '';
  if (!raw) return DEFAULT_AGNES_BASE;
  return normalizeAgnesBase(raw);
}

export function resolveAgnesApiKey(env) {
  const key = env && typeof env.AGNES_API_KEY === 'string' ? env.AGNES_API_KEY.trim() : '';
  return key;
}

export function agnesRuntime(env) {
  const apiKey = resolveAgnesApiKey(env);
  return {
    configured: apiKey.length > 0,
    apiKey,
    base: resolveAgnesBase(env),
    model: AGNES_MODEL,
    publicOrigin: customMediaOrigin(env),
  };
}

export function blockedMediaHost(host) {
  const name = String(host || '').toLowerCase().replace(/\.+$/, '');
  if (!name) return true;
  if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local')) return true;
  if (name === 'pages.dev' || name.endsWith('.pages.dev')) return true;
  if (name === 'workers.dev' || name.endsWith('.workers.dev')) return true;
  if (name.endsWith('.r2.dev')) return true;
  if (privateAddress(name)) return true;
  return false;
}

function privateAddress(host) {
  if (host.includes(':')) return true;
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => n > 255)) return false;
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function normalizeSiteApex(raw) {
  const text = String(raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '')
    .toLowerCase();
  if (!text || text.length > 253 || !/^[a-z0-9.-]+$/.test(text)) return '';
  if (text.startsWith('.') || text.includes('..')) return '';
  return text;
}

/** https origin Agnes may fetch. Empty when the apex is unset or is a Cloudflare host. */
export function customMediaOrigin(env) {
  const apex = normalizeSiteApex(env && env.PUBLIC_SITE_APEX);
  if (!apex || blockedMediaHost(apex)) return '';
  return `https://${apex}`;
}

function hostOnApex(host, apex) {
  if (host === apex) return true;
  const suffix = `.${apex}`;
  if (!host.endsWith(suffix)) return false;
  const sub = host.slice(0, -suffix.length);
  return Boolean(sub) && !sub.includes('.');
}

/**
 * Public https URL on the custom apex or one keyword subdomain.
 * Rejects Cloudflare preview hosts even if they match a mis-set apex.
 */
export function assertAgnesInputUrl(raw, origin) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw fail('agnes_unreachable_input');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('agnes_unreachable_input');
  const host = url.hostname.toLowerCase();
  if (blockedMediaHost(host)) throw fail('agnes_unreachable_input');
  let apex = '';
  try {
    apex = new URL(origin).hostname.toLowerCase();
  } catch {
    throw fail('agnes_unreachable_input');
  }
  if (!apex || blockedMediaHost(apex) || !hostOnApex(host, apex)) throw fail('agnes_unreachable_input');
  return url.toString();
}

export function assertAgnesResultUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw fail('agnes_bad_result');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('agnes_bad_result');
  if (blockedMediaHost(url.hostname)) throw fail('agnes_bad_result');
  return url.toString();
}

/**
 * Output seconds for one reference slice that is already 2–12s.
 * Returns null when that slice is under 2s or over 12s.
 * A slice inside 2–12s that rounds below 4 requests "4".
 * Longer templates are split by planAgnesSegments instead of being trimmed.
 */
export function agnesOutputSeconds(durationSeconds) {
  const seconds = Number(durationSeconds);
  if (!Number.isFinite(seconds) || seconds < AGNES_VIDEO_MIN_SECONDS || seconds > AGNES_VIDEO_MAX_SECONDS) {
    return null;
  }
  const rounded = Math.round(seconds);
  const clamped = Math.min(AGNES_OUTPUT_MAX_SECONDS, Math.max(AGNES_OUTPUT_MIN_SECONDS, rounded));
  return String(clamped);
}

export const AGNES_MAX_SEGMENTS = 8;

/**
 * One Agnes job when the whole template is 2–12s.
 * More than one even piece when it is longer, and only as many as needed
 * to keep every piece inside 4–12s. A 15.28s clip is two pieces, not 12+3.28.
 * Sync times (keyframe DTS, seconds) snap the cuts so each piece can decode.
 * Returns null when no cut keeps every piece inside 4–12s.
 */
export function planAgnesSegments(durationSeconds, syncTimes) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration < AGNES_VIDEO_MIN_SECONDS) return null;
  if (duration <= AGNES_VIDEO_MAX_SECONDS) {
    const seconds = agnesOutputSeconds(duration);
    if (!seconds) return null;
    return [{ index: 0, start: 0, end: duration, seconds }];
  }
  const parts = Math.ceil(duration / AGNES_VIDEO_MAX_SECONDS);
  const maxParts = Math.floor(duration / AGNES_OUTPUT_MIN_SECONDS);
  if (parts < 2 || parts > maxParts || parts > AGNES_MAX_SEGMENTS) return null;
  const sync = (Array.isArray(syncTimes) ? syncTimes : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0.05 && value < duration - 0.05)
    .sort((a, b) => a - b);
  const cuts = sync.length ? snapCuts(duration, parts, sync) : evenCuts(duration, parts);
  if (!cuts) return null;
  const bounds = [0, ...cuts, duration];
  return bounds.slice(0, -1).map((start, index) => {
    const end = bounds[index + 1];
    const seconds = agnesOutputSeconds(end - start);
    if (!seconds) return null;
    return { index, start, end, seconds };
  }).every(Boolean)
    ? bounds.slice(0, -1).map((start, index) => {
        const end = bounds[index + 1];
        return { index, start, end, seconds: agnesOutputSeconds(end - start) };
      })
    : null;
}

function segmentFits(duration, cuts) {
  const bounds = [0, ...cuts, duration];
  for (let i = 1; i < bounds.length; i += 1) {
    const len = bounds[i] - bounds[i - 1];
    if (len < AGNES_OUTPUT_MIN_SECONDS - 0.02 || len > AGNES_VIDEO_MAX_SECONDS + 0.02) return false;
  }
  return true;
}

function evenCuts(duration, parts) {
  const cuts = [];
  for (let k = 1; k < parts; k += 1) cuts.push((duration * k) / parts);
  return segmentFits(duration, cuts) ? cuts : null;
}

function snapCuts(duration, parts, sync) {
  const cuts = [];
  let prev = 0;
  for (let k = 1; k < parts; k += 1) {
    const ideal = (duration * k) / parts;
    const remain = parts - k;
    const options = sync.filter((time) => {
      if (time <= prev + AGNES_OUTPUT_MIN_SECONDS - 0.02) return false;
      if (time > prev + AGNES_VIDEO_MAX_SECONDS + 0.02) return false;
      if (duration - time < remain * AGNES_OUTPUT_MIN_SECONDS - 0.02) return false;
      if (duration - time > remain * AGNES_VIDEO_MAX_SECONDS + 0.02) return false;
      return true;
    });
    if (!options.length) return null;
    options.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal) || a - b);
    cuts.push(options[0]);
    prev = options[0];
  }
  return segmentFits(duration, cuts) ? cuts : null;
}

export function agnesPollDelayMs(previousMs) {
  const prev = Number(previousMs);
  if (!Number.isFinite(prev) || prev < AGNES_POLL_MIN_MS) return AGNES_POLL_MIN_MS;
  return Math.min(prev * 2, AGNES_POLL_MAX_MS);
}

function referenceDuration(catalogSeconds, probedSeconds) {
  const probed = Number(probedSeconds);
  if (Number.isFinite(probed) && probed > 0) return probed;
  const catalog = Number(catalogSeconds);
  if (Number.isFinite(catalog) && catalog > 0) return catalog;
  return null;
}

/**
 * Whether this photo + template can be one or more Agnes reference jobs.
 * A clip over 12s is split. It is not a reason to leave Agnes.
 * A probed duration wins over the catalog.
 */
export function agnesMediaDecision({
  durationSeconds,
  videoBytes,
  imageBytes,
  imageWidth,
  imageHeight,
}) {
  const probe = probeReferenceMp4(videoBytes);
  const duration = referenceDuration(durationSeconds, probe.durationSeconds);
  const segments = planAgnesSegments(duration, probe.syncTimes);
  if (!segments) {
    return { ok: false, reason: duration > AGNES_VIDEO_MAX_SECONDS ? 'segment' : 'duration', duration };
  }
  if (probe.fps != null && (probe.fps < AGNES_FPS_MIN || probe.fps > AGNES_FPS_MAX)) {
    return { ok: false, reason: 'fps', fps: probe.fps, duration };
  }
  const size = videoBytes && videoBytes.byteLength ? videoBytes.byteLength : 0;
  if (segments.length === 1 && size >= AGNES_VIDEO_MAX_BYTES) return { ok: false, reason: 'size', duration };
  const imageSize = Number(imageBytes) || 0;
  if (imageSize <= 0 || imageSize > AGNES_IMAGE_MAX_BYTES) return { ok: false, reason: 'image_size', duration };
  const width = Number(imageWidth) || 0;
  const height = Number(imageHeight) || 0;
  if (
    width < AGNES_IMAGE_MIN_SIDE ||
    height < AGNES_IMAGE_MIN_SIDE ||
    width > AGNES_IMAGE_MAX_SIDE ||
    height > AGNES_IMAGE_MAX_SIDE
  ) {
    return { ok: false, reason: 'image_dimensions', duration };
  }
  return {
    ok: true,
    reason: segments.length > 1 ? 'split' : 'reference',
    seconds: segments[0].seconds,
    duration,
    fps: probe.fps,
    segments,
  };
}

export function buildReferenceRequest(runtime, { imageUrl, videoUrl, seconds }) {
  const origin = runtime && runtime.publicOrigin;
  const image = assertAgnesInputUrl(imageUrl, origin);
  const video = assertAgnesInputUrl(videoUrl, origin);
  const videoPath = new URL(video).pathname;
  const templatePath = /^\/brand\/templates\/[a-z0-9-]+-demo\.mp4$/.test(videoPath);
  const segmentPath = /^\/api\/media\/jobs\/[A-Za-z0-9_-]+\/seg[0-7]$/.test(videoPath);
  if (!templatePath && !segmentPath) throw fail('agnes_unreachable_input');
  const outputSeconds = typeof seconds === 'string' && /^([4-9]|1[0-2])$/.test(seconds) ? seconds : agnesOutputSeconds(seconds);
  if (!outputSeconds) throw fail('agnes_bad_seconds');
  return {
    url: `${runtime.base}/videos`,
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: runtime.model || AGNES_MODEL,
      prompt: REFERENCE_PROMPT,
      seconds: outputSeconds,
      mode: 'reference',
      size: AGNES_SIZE,
      aspect_ratio: AGNES_ASPECT_RATIO,
      images: [image],
      videos: [{ url: video, start_seconds: 0, require_audio: false }],
    },
  };
}

export function agnesPollUrl(runtime, videoId) {
  const id = String(videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{8,76}$/.test(id)) throw fail('agnes_bad_task');
  const base = new URL(runtime.base);
  const url = new URL('/agnesapi', base.origin);
  url.searchParams.set('video_id', id);
  url.searchParams.set('model_name', runtime.model || AGNES_MODEL);
  return url.toString();
}

export function packAgnesTaskId(videoId, index = 0, count = 1) {
  const id = String(videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{8,76}$/.test(id)) throw fail('agnes_bad_task');
  const prefix = count > 1 ? `ag${index}_` : AGNES_TASK_PREFIX;
  if (!/^agn_$|^ag[0-7]_$/.test(prefix)) throw fail('agnes_bad_task');
  const stored = `${prefix}${id}`;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(stored)) throw fail('agnes_bad_task');
  return stored;
}

export function unpackAgnesTaskId(stored) {
  if (typeof stored !== 'string') return null;
  let index = 0;
  let multi = false;
  let id = '';
  if (stored.startsWith(AGNES_TASK_PREFIX)) {
    id = stored.slice(AGNES_TASK_PREFIX.length);
  } else {
    const match = /^ag([0-7])_/.exec(stored);
    if (!match) return null;
    multi = true;
    index = Number(match[1]);
    id = stored.slice(4);
  }
  if (!/^[A-Za-z0-9_-]{8,76}$/.test(id)) return null;
  return { videoId: id, index, multi };
}

export async function agnesSegmentInputs(env, jobId, index) {
  const origin = customMediaOrigin(env);
  if (!origin) return null;
  if (!Number.isInteger(index) || index < 0 || index > 7) return null;
  const host = new URL(origin).hostname;
  const secret = resolveAuthSecret(env, host).secret;
  if (!secret || String(secret).length < 16) return null;
  const exp = Math.floor(Date.now() / 1000) + AGNES_INPUT_TTL_SEC;
  const kind = `seg${index}`;
  const photoQuery = await signMediaQuery(secret, { jobId, kind: 'photo', exp });
  const segmentQuery = await signMediaQuery(secret, { jobId, kind, exp });
  const imageUrl = assertAgnesInputUrl(mediaDownloadUrl(origin, jobId, 'photo', photoQuery), origin);
  const videoUrl = assertAgnesInputUrl(mediaDownloadUrl(origin, jobId, kind, segmentQuery), origin);
  return { imageUrl, videoUrl };
}

export async function agnesInputUrls(env, jobId, referenceVideo) {
  const origin = customMediaOrigin(env);
  if (!origin) return null;
  const reference = typeof referenceVideo === 'string' ? referenceVideo : '';
  if (!/^\/brand\/templates\/[a-z0-9-]+-demo\.mp4$/.test(reference)) return null;
  const host = new URL(origin).hostname;
  const secret = resolveAuthSecret(env, host).secret;
  if (!secret || String(secret).length < 16) return null;
  const exp = Math.floor(Date.now() / 1000) + AGNES_INPUT_TTL_SEC;
  const query = await signMediaQuery(secret, { jobId, kind: 'photo', exp });
  const imageUrl = assertAgnesInputUrl(mediaDownloadUrl(origin, jobId, 'photo', query), origin);
  const videoUrl = assertAgnesInputUrl(new URL(reference, origin).toString(), origin);
  return { imageUrl, videoUrl };
}

function providerCode(raw) {
  const text = String(raw || 'error')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40);
  return text || 'error';
}

function providerMessage(body) {
  if (!body || typeof body !== 'object') return '';
  const nested = body.error && typeof body.error === 'object' ? body.error.message : '';
  const direct = nested || body.message || body.error || '';
  return String(direct).replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function agnesError(status, body, phase) {
  const err = fail('agnes_error');
  err.httpStatus = status;
  err.phase = phase;
  const code = body && typeof body === 'object' ? body.code || (body.error && body.error.code) : '';
  err.providerCode = providerCode(code || `http_${status || 0}`);
  err.providerMessage = providerMessage(body);
  err.transient = status === 429 || status >= 500 || status === 0;
  err.rejected = status === 400 || status === 401 || status === 403 || status === 404;
  return err;
}

export function redactAgnesDetail(message, apiKey) {
  let text = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (apiKey && text.includes(apiKey)) text = text.split(apiKey).join('[redacted]');
  return text;
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 180) };
  }
}

async function requestJson(fetchImpl, url, init, phase) {
  let res;
  try {
    res = await fetchImpl(url, {
      ...init,
      signal: init.signal || AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const wrapped = agnesError(0, { message: err && err.name ? err.name : 'network' }, phase);
    wrapped.cause = err;
    throw wrapped;
  }
  const json = await readJson(res);
  if (!res.ok) throw agnesError(res.status, json, phase);
  return json;
}

function videoIdOf(json) {
  const id = json && typeof json.video_id === 'string' ? json.video_id.trim() : '';
  if (!/^[A-Za-z0-9_-]{8,76}$/.test(id)) return '';
  return id;
}

export async function createReferenceVideo(runtime, fetchImpl, input) {
  const req = buildReferenceRequest(runtime, input);
  const json = await requestJson(
    fetchImpl,
    req.url,
    { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) },
    'create',
  );
  const videoId = videoIdOf(json);
  // A 200 without video_id may already be a billed task. Do not retry it.
  if (!videoId) throw fail('agnes_submit_uncertain');
  return { videoId, status: json && json.status ? String(json.status) : 'queued' };
}

export async function getAgnesVideo(runtime, fetchImpl, videoId) {
  const json = await requestJson(fetchImpl, agnesPollUrl(runtime, videoId), { method: 'GET', headers: { Authorization: `Bearer ${runtime.apiKey}` } }, 'poll');
  return json && typeof json === 'object' ? json : {};
}

export async function downloadAgnesVideo(fetchImpl, videoUrl, maxBytes) {
  const url = assertAgnesResultUrl(videoUrl);
  let res;
  try {
    res = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(120_000) });
  } catch (err) {
    const wrapped = agnesError(0, { message: err && err.name ? err.name : 'network' }, 'download');
    wrapped.cause = err;
    throw wrapped;
  }
  if (res && res.url) {
    try {
      assertAgnesResultUrl(res.url);
    } catch (err) {
      throw err;
    }
  }
  if (!res.ok) throw agnesError(res.status, null, 'download');
  const declared = Number(res.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw fail('video_too_large');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw fail('video_too_large');
  return bytes;
}

function boxType(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readBoxes(bytes, start, end) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = view.getUint32(p);
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      const large = view.getBigUint64(p + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) break;
    out.push({
      type: boxType(bytes, p + 4),
      header,
      contentStart: p + header,
      contentEnd: p + size,
    });
    p += size;
  }
  return out;
}

function findDescendant(bytes, start, end, type) {
  for (const box of readBoxes(bytes, start, end)) {
    if (box.type === type) return box;
    if (CONTAINERS.has(box.type)) {
      const found = findDescendant(bytes, box.contentStart, box.contentEnd, type);
      if (found) return found;
    }
  }
  return null;
}

function mediaTiming(bytes, box) {
  if (!box || box.contentStart + 20 > bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[box.contentStart];
  const scaleAt = version === 1 ? box.contentStart + 20 : box.contentStart + 12;
  const durAt = version === 1 ? box.contentStart + 24 : box.contentStart + 16;
  if (durAt + (version === 1 ? 8 : 4) > box.contentEnd) return null;
  const scale = view.getUint32(scaleAt);
  if (!scale) return null;
  const duration = version === 1 ? Number(view.getBigUint64(durAt)) : view.getUint32(durAt);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return { scale, duration, seconds: duration / scale };
}

function handlerOf(bytes, trak) {
  const mdia = readBoxes(bytes, trak.contentStart, trak.contentEnd).find((box) => box.type === 'mdia');
  if (!mdia) return '';
  const hdlr = readBoxes(bytes, mdia.contentStart, mdia.contentEnd).find((box) => box.type === 'hdlr');
  if (!hdlr || hdlr.contentStart + 12 > bytes.length) return '';
  return boxType(bytes, hdlr.contentStart + 8);
}

function syncTimes(bytes, trak, scale) {
  const stts = findDescendant(bytes, trak.contentStart, trak.contentEnd, 'stts');
  const stss = findDescendant(bytes, trak.contentStart, trak.contentEnd, 'stss');
  if (!stts || !stss || !scale) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint32(stts.contentStart + 4);
  if (!entryCount || entryCount > 4096) return [];
  const deltas = [];
  for (let i = 0; i < entryCount; i += 1) {
    const at = stts.contentStart + 8 + i * 8;
    if (at + 8 > stts.contentEnd) return [];
    const count = view.getUint32(at);
    const delta = view.getUint32(at + 4);
    if (!delta || count > 200000) return [];
    for (let n = 0; n < count; n += 1) deltas.push(delta);
  }
  const syncCount = view.getUint32(stss.contentStart + 4);
  if (!syncCount || syncCount > 4096) return [];
  const times = [];
  for (let i = 0; i < syncCount; i += 1) {
    const at = stss.contentStart + 8 + i * 4;
    if (at + 4 > stss.contentEnd) return [];
    const sample = view.getUint32(at);
    if (sample < 1 || sample > deltas.length) return [];
    let ticks = 0;
    for (let n = 0; n < sample - 1; n += 1) ticks += deltas[n];
    times.push(ticks / scale);
  }
  return times;
}

function videoFps(bytes, trak, scale) {
  const stts = findDescendant(bytes, trak.contentStart, trak.contentEnd, 'stts');
  if (!stts || !scale) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (stts.contentStart + 8 > stts.contentEnd) return null;
  const count = view.getUint32(stts.contentStart + 4);
  if (!count || count > 64) return null;
  let samples = 0;
  let ticks = 0;
  for (let i = 0; i < count; i += 1) {
    const at = stts.contentStart + 8 + i * 8;
    if (at + 8 > stts.contentEnd) return null;
    const sampleCount = view.getUint32(at);
    const sampleDelta = view.getUint32(at + 4);
    samples += sampleCount;
    ticks += sampleCount * sampleDelta;
  }
  if (!samples || !ticks) return null;
  return (samples * scale) / ticks;
}

/** Duration and video fps from an MP4. Null fields when the file is not a full movie. */
export function probeReferenceMp4(bytes) {
  const empty = { durationSeconds: null, fps: null, syncTimes: null };
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 32) return empty;
  try {
    const top = readBoxes(bytes, 0, bytes.byteLength);
    const moov = top.find((box) => box.type === 'moov');
    if (!moov) return empty;
    const mvhd = readBoxes(bytes, moov.contentStart, moov.contentEnd).find((box) => box.type === 'mvhd');
    const movie = mediaTiming(bytes, mvhd);
    const traks = readBoxes(bytes, moov.contentStart, moov.contentEnd).filter((box) => box.type === 'trak');
    const video = traks.find((trak) => handlerOf(bytes, trak) === 'vide');
    const mdhd = video ? findDescendant(bytes, video.contentStart, video.contentEnd, 'mdhd') : null;
    const track = mediaTiming(bytes, mdhd);
    const durations = [movie && movie.seconds, track && track.seconds].filter((n) => Number.isFinite(n) && n > 0);
    const durationSeconds = durations.length ? Math.max(...durations) : null;
    const fps = video && track ? videoFps(bytes, video, track.scale) : null;
    return {
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
      fps: Number.isFinite(fps) ? fps : null,
      syncTimes: video ? syncTimes(bytes, video, track && track.scale) : null,
    };
  } catch {
    return empty;
  }
}
