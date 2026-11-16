/**
 * HTTP client for official xAI Grok Imagine video (grok-imagine-video-1.5).
 *
 * Create: POST https://api.x.ai/v1/videos/generations
 * Poll:   GET  https://api.x.ai/v1/videos/{request_id}
 * Docs:   https://docs.x.ai/developers/model-capabilities/video/reference-to-video
 *
 * Customer photos are reference images. The body has no template video, no
 * pinned first frame, and no keyframes. Pack tokens `<Image N>` (1-based)
 * are cited as `<IMAGE_0>`, `<IMAGE_1>`, … in that same order.
 *
 * grok-imagine-video-1.5-lite is not used. It does not accept reference images.
 * With references the clip is 9:16 and 720p, duration 1–15 seconds.
 *
 * List price, for operators only. This module does not change credit charges.
 * 720p is $0.14 per second plus $0.01 per input image. Live jobs still use
 * creditsForDuration (one credit per rounded source second).
 *
 * The prompt sent here is the adapted pack text plus the token rewrite.
 * This file does not add a human subject, a human face, or human hands.
 */

import { fail } from './account-db.js';
import { assertAgnesInputUrl, blockedMediaHost, customMediaOrigin } from './agnes.js';

export const IMAGINE_MODEL = 'grok-imagine-video-1.5';
export const DEFAULT_XAI_BASE = 'https://api.x.ai/v1';
export const IMAGINE_ASPECT_RATIO = '9:16';
export const IMAGINE_RESOLUTION = '720p';
export const IMAGINE_MIN_SECONDS = 1;
export const IMAGINE_MAX_SECONDS = 15;
export const IMAGINE_MAX_REFERENCE_IMAGES = 14;
export const IMAGINE_TASK_PREFIX = 'xai_';
export const IMAGINE_POLL_MIN_MS = 6_000;
export const IMAGINE_POLL_MAX_MS = 60_000;

const IMAGINE_REQUEST_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function citeImagineImages(prompt) {
  return String(prompt || '').replace(/<Image (\d+)>/g, (_, digits) => {
    const index = Number(digits) - 1;
    if (!Number.isInteger(index) || index < 0) return `<Image ${digits}>`;
    return `<IMAGE_${index}>`;
  });
}

/** Integer seconds inside the Imagine reference range. Caps, does not split. */
export function imagineDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < IMAGINE_MIN_SECONDS) return IMAGINE_MIN_SECONDS;
  if (rounded > IMAGINE_MAX_SECONDS) return IMAGINE_MAX_SECONDS;
  return rounded;
}

function tokenIndex(token) {
  const match = /^<Image (\d+)>$/.exec(token || '');
  return match ? Number(match[1]) : 99;
}

/**
 * Shape a reference-image create body from an adapted pack segment.
 * Nothing is sent. A missing URL clears the whole image list so `<IMAGE_n>`
 * cannot shift. No video field is set.
 */
export function formatImagineCreatePayload(adapted, segmentId) {
  const segments = adapted && Array.isArray(adapted.segments) ? adapted.segments : [];
  const segment = segments.find((item) => item.id === segmentId);
  if (!segment) throw fail('invalid_pack');
  const roles = adapted && Array.isArray(adapted.roles) ? adapted.roles : [];
  const filled = roles.filter((role) => role && role.status === 'filled' && role.deliveryToken);
  filled.sort((a, b) => tokenIndex(a.deliveryToken) - tokenIndex(b.deliveryToken));
  const imageSlots = filled.map((role) => {
    const url = role.image && role.image.url;
    return {
      roleId: role.roleId,
      deliveryToken: role.deliveryToken,
      url: typeof url === 'string' && /^https:\/\//i.test(url) ? url : null,
    };
  });
  const warnings = [];
  const missing = imageSlots.filter((slot) => !slot.url);
  if (missing.length) {
    warnings.push(
      `Missing public image URLs for ${missing.map((slot) => slot.roleId).join(', ')}. reference_images was left empty so a partial list cannot shift <IMAGE_n> tokens.`,
    );
  }
  if (imageSlots.length > IMAGINE_MAX_REFERENCE_IMAGES) {
    warnings.push(
      `This segment has ${imageSlots.length} reference images. Imagine accepts ${IMAGINE_MAX_REFERENCE_IMAGES}. reference_images was left empty instead of dropping one.`,
    );
  }
  const duration = imagineDuration(segment.promptSeconds);
  if (duration == null) throw fail('imagine_bad_seconds');
  const prompt = citeImagineImages(segment.prompt);
  if (prompt.includes('<Video') || /<Image \d+>/.test(prompt)) {
    warnings.push('Prompt still names a video or an unmapped image token. Do not POST this body.');
  }
  const tooMany = imageSlots.length > IMAGINE_MAX_REFERENCE_IMAGES;
  const referenceImages = missing.length || tooMany ? [] : imageSlots.map((slot) => ({ url: slot.url }));
  return {
    notSent: true,
    create: {
      method: 'POST',
      url: `${DEFAULT_XAI_BASE}/videos/generations`,
      body: {
        model: IMAGINE_MODEL,
        prompt,
        reference_images: referenceImages,
        duration,
        aspect_ratio: IMAGINE_ASPECT_RATIO,
        resolution: IMAGINE_RESOLUTION,
      },
    },
    poll: {
      method: 'GET',
      url: `${DEFAULT_XAI_BASE}/videos/{request_id}`,
    },
    imageSlots,
    warnings,
  };
}

export function normalizeXaiBase(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw fail('xai_bad_base');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('xai_bad_base');
  url.search = '';
  url.hash = '';
  let path = url.pathname.replace(/\/+$/, '');
  if (path === '' || path === '/') path = '/v1';
  url.pathname = path;
  return url.toString().replace(/\/$/, '');
}

export function resolveXaiBase(env) {
  const raw = env && typeof env.XAI_BASE_URL === 'string' ? env.XAI_BASE_URL.trim() : '';
  if (!raw) return DEFAULT_XAI_BASE;
  return normalizeXaiBase(raw);
}

export function resolveXaiApiKey(env) {
  const key = env && typeof env.XAI_API_KEY === 'string' ? env.XAI_API_KEY.trim() : '';
  return key;
}

export function imagineRuntime(env) {
  const apiKey = resolveXaiApiKey(env);
  return {
    configured: apiKey.length > 0,
    apiKey,
    base: resolveXaiBase(env),
    model: IMAGINE_MODEL,
    publicOrigin: customMediaOrigin(env),
  };
}

function assertImagineInputUrl(raw, origin) {
  try {
    return assertAgnesInputUrl(raw, origin);
  } catch (err) {
    const wrapped = fail('imagine_unreachable_input');
    wrapped.cause = err;
    throw wrapped;
  }
}

export function assertImagineResultUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw fail('imagine_bad_result');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('imagine_bad_result');
  if (blockedMediaHost(url.hostname)) throw fail('imagine_bad_result');
  return url.toString();
}

export function imaginePollDelayMs(previousMs) {
  const prev = Number(previousMs);
  if (!Number.isFinite(prev) || prev < IMAGINE_POLL_MIN_MS) return IMAGINE_POLL_MIN_MS;
  return Math.min(prev * 2, IMAGINE_POLL_MAX_MS);
}

/**
 * POST body for one images-only generation. Rejects a video field and the
 * lite model. Duration is capped to 1–15. Every reference image is cited.
 */
export function buildImagineRequest(runtime, input) {
  if (!runtime || !runtime.apiKey) throw fail('xai_unset');
  if (runtime.model && runtime.model !== IMAGINE_MODEL) throw fail('imagine_bad_model');
  const source = input || {};
  if (source.videoUrl || source.video || source.videos || source.image || source.keyframes) {
    throw fail('imagine_bad_prompt');
  }
  const listed = Array.isArray(source.imageUrls) ? source.imageUrls : [];
  if (listed.length < 1 || listed.length > IMAGINE_MAX_REFERENCE_IMAGES) throw fail('imagine_unreachable_input');
  const images = listed.map((url) => assertImagineInputUrl(url, runtime.publicOrigin));
  const duration = imagineDuration(source.duration != null ? source.duration : source.seconds);
  if (duration == null) throw fail('imagine_bad_seconds');
  let prompt = String(source.prompt || '').trim();
  if (!prompt) throw fail('imagine_bad_prompt');
  if (/<Image \d+>/.test(prompt)) prompt = citeImagineImages(prompt);
  if (/<Video\b/i.test(prompt) || /<Image \d+>/.test(prompt)) throw fail('imagine_bad_prompt');
  if (prompt.includes('grok-imagine-video-1.5-lite')) throw fail('imagine_bad_model');
  const mentioned = prompt.match(/<IMAGE_\d+>/g) || [];
  if (!mentioned.length) throw fail('imagine_bad_prompt');
  for (const token of mentioned) {
    const index = Number(token.slice('<IMAGE_'.length, -1));
    if (!Number.isInteger(index) || index < 0 || index >= images.length) throw fail('imagine_bad_prompt');
  }
  return {
    url: `${runtime.base}/videos/generations`,
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: IMAGINE_MODEL,
      prompt,
      reference_images: images.map((url) => ({ url })),
      duration,
      aspect_ratio: IMAGINE_ASPECT_RATIO,
      resolution: IMAGINE_RESOLUTION,
    },
  };
}

export function imaginePollUrl(runtime, requestId) {
  const id = String(requestId || '').trim();
  if (!IMAGINE_REQUEST_ID.test(id)) throw fail('imagine_bad_task');
  return `${runtime.base}/videos/${id}`;
}

export function packImagineTaskId(requestId) {
  const id = String(requestId || '').trim();
  if (!IMAGINE_REQUEST_ID.test(id)) throw fail('imagine_bad_task');
  const stored = `${IMAGINE_TASK_PREFIX}${id}`;
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(stored)) throw fail('imagine_bad_task');
  return stored;
}

/**
 * Parallel pieces share one jobs.provider_task_id.
 * `xi2_36<uuid>00` is piece 0 created and piece 1 not created yet.
 */
export function packImagineTaskSet(requestIds) {
  if (!Array.isArray(requestIds) || requestIds.length < 2 || requestIds.length > 8) throw fail('imagine_bad_task');
  let body = '';
  for (const raw of requestIds) {
    const id = raw ? String(raw).trim() : '';
    if (id && !IMAGINE_REQUEST_ID.test(id)) throw fail('imagine_bad_task');
    body += String(id.length).padStart(2, '0') + id;
  }
  const stored = `xi${requestIds.length}_${body}`;
  if (!/^[A-Za-z0-9_-]{8,640}$/.test(stored)) throw fail('imagine_bad_task');
  return stored;
}

export function unpackImagineTaskId(stored) {
  if (typeof stored !== 'string') return null;
  const parallel = /^xi([2-8])_(.*)$/.exec(stored);
  if (parallel) {
    const count = Number(parallel[1]);
    const body = parallel[2];
    const slots = [];
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
      if (cursor + 2 > body.length) return null;
      const len = Number(body.slice(cursor, cursor + 2));
      if (!Number.isInteger(len) || len < 0 || (len !== 0 && (len < 8 || len > 80))) return null;
      cursor += 2;
      const id = body.slice(cursor, cursor + len);
      if (id.length !== len) return null;
      if (len !== 0 && !IMAGINE_REQUEST_ID.test(id)) return null;
      slots.push(id);
      cursor += len;
    }
    if (cursor !== body.length) return null;
    const index = slots.findIndex(Boolean);
    return {
      requestId: index >= 0 ? slots[index] : '',
      index: index >= 0 ? index : 0,
      multi: true,
      parallel: true,
      count,
      slots,
    };
  }
  if (!stored.startsWith(IMAGINE_TASK_PREFIX)) return null;
  const id = stored.slice(IMAGINE_TASK_PREFIX.length);
  if (!IMAGINE_REQUEST_ID.test(id)) return null;
  return { requestId: id, index: 0, multi: false, parallel: false, count: 1, slots: null };
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

export function imagineError(status, body, phase) {
  const err = fail('imagine_error');
  err.httpStatus = status;
  err.phase = phase;
  const code = body && typeof body === 'object' ? body.code || (body.error && body.error.code) : '';
  err.providerCode = providerCode(code || `http_${status || 0}`);
  err.providerMessage = providerMessage(body);
  err.transient = status === 429 || status >= 500 || status === 0;
  err.rejected = status === 400 || status === 401 || status === 403 || status === 404;
  return err;
}

export function redactImagineDetail(message, apiKey) {
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
    const wrapped = imagineError(0, { message: err && err.name ? err.name : 'network' }, phase);
    wrapped.cause = err;
    throw wrapped;
  }
  const json = await readJson(res);
  if (!res.ok) throw imagineError(res.status, json, phase);
  return json;
}

function requestIdOf(json) {
  const id = json && typeof json.request_id === 'string' ? json.request_id.trim() : '';
  if (!IMAGINE_REQUEST_ID.test(id)) return '';
  return id;
}

export function imagineResultUrl(task) {
  const video = task && task.video && typeof task.video === 'object' ? task.video : null;
  if (!video || video.respect_moderation === false) return '';
  return typeof video.url === 'string' ? video.url : '';
}

export async function createImagineVideo(runtime, fetchImpl, input) {
  const req = buildImagineRequest(runtime, input);
  const json = await requestJson(
    fetchImpl,
    req.url,
    { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) },
    'create',
  );
  const requestId = requestIdOf(json);
  if (!requestId) throw fail('imagine_submit_uncertain');
  return { requestId, status: 'pending' };
}

export async function getImagineVideo(runtime, fetchImpl, requestId) {
  const json = await requestJson(
    fetchImpl,
    imaginePollUrl(runtime, requestId),
    { method: 'GET', headers: { Authorization: `Bearer ${runtime.apiKey}` } },
    'poll',
  );
  return json && typeof json === 'object' ? json : {};
}

export async function downloadImagineVideo(fetchImpl, videoUrl, maxBytes) {
  const url = assertImagineResultUrl(videoUrl);
  let res;
  try {
    res = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(120_000) });
  } catch (err) {
    const wrapped = imagineError(0, { message: err && err.name ? err.name : 'network' }, 'download');
    wrapped.cause = err;
    throw wrapped;
  }
  if (res && res.url) assertImagineResultUrl(res.url);
  if (!res.ok) throw imagineError(res.status, null, 'download');
  const declared = Number(res.headers && res.headers.get ? res.headers.get('content-length') || 0 : 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw fail('video_too_large');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw fail('video_too_large');
  return bytes;
}
