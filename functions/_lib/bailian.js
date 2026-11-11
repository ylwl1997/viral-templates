/**
 * HTTP client for Alibaba Bailian / DashScope wan2.2-animate-mix.
 * No CLI. Pages Functions call the async image2video API only.
 *
 * Submit: POST {base}/services/aigc/image2video/video-synthesis
 *   Header X-DashScope-Async: enable
 *   Header X-DashScope-OssResourceResolve: enable when image_url / video_url are oss://
 * Poll:   GET  {base}/tasks/{task_id}
 *
 * Default base is the Beijing workspace host. Set BAILIAN_DASHSCOPE_BASE_URL
 * to override. The classic host remains the fallback for the temporary-file
 * credential API if the workspace host does not serve /uploads.
 *
 * Docs: https://help.aliyun.com/zh/model-studio/wan-animate-mix-api
 *       https://help.aliyun.com/zh/model-studio/get-temporary-file-url
 */

import { fail } from './account-db.js';

export const DEFAULT_MODEL = 'wan2.2-animate-mix';
export const DEFAULT_MODE = 'wan-std';
export const WORKSPACE_DASHSCOPE_BASE =
  'https://llm-g1ozpdi7y5eyp1mh.cn-beijing.maas.aliyuncs.com/api/v1';
export const CLASSIC_DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/api/v1';
export const BAILIAN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const MODES = new Set(['wan-std', 'wan-pro']);

export function normalizeDashScopeBase(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw fail('bailian_bad_base');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('bailian_bad_base');
  url.search = '';
  url.hash = '';
  let path = url.pathname.replace(/\/+$/, '');
  if (path === '' || path === '/') path = '/api/v1';
  url.pathname = path;
  return url.toString().replace(/\/$/, '');
}

export function resolveDashScopeBase(env) {
  const raw = env && typeof env.BAILIAN_DASHSCOPE_BASE_URL === 'string' ? env.BAILIAN_DASHSCOPE_BASE_URL.trim() : '';
  if (!raw) return WORKSPACE_DASHSCOPE_BASE;
  return normalizeDashScopeBase(raw);
}

export function resolveBailianApiKey(env) {
  const primary = env && typeof env.BAILIAN_API_KEY === 'string' ? env.BAILIAN_API_KEY.trim() : '';
  if (primary) return primary;
  const legacy = env && typeof env.DASHSCOPE_API_KEY === 'string' ? env.DASHSCOPE_API_KEY.trim() : '';
  return legacy;
}

export function resolveBailianModel(env) {
  const raw = env && typeof env.BAILIAN_MODEL === 'string' ? env.BAILIAN_MODEL.trim() : '';
  if (!raw) return DEFAULT_MODEL;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(raw)) throw fail('bailian_bad_model');
  return raw;
}

export function resolveBailianMode(env) {
  const raw = env && typeof env.BAILIAN_MODE === 'string' ? env.BAILIAN_MODE.trim() : '';
  if (!raw) return DEFAULT_MODE;
  if (!MODES.has(raw)) throw fail('bailian_bad_mode');
  return raw;
}

export function resolveBailianWatermark(env) {
  const raw = env && typeof env.BAILIAN_WATERMARK === 'string' ? env.BAILIAN_WATERMARK.trim().toLowerCase() : '';
  return raw === '1' || raw === 'true';
}

export function bailianRuntime(env) {
  const base = resolveDashScopeBase(env);
  const model = resolveBailianModel(env);
  const mode = resolveBailianMode(env);
  const apiKey = resolveBailianApiKey(env);
  return {
    configured: apiKey.length > 0,
    apiKey,
    base,
    model,
    mode,
    watermark: resolveBailianWatermark(env),
    publicMediaBase: resolvePublicMediaBase(env),
  };
}

/**
 * URLs DashScope is allowed to read.
 * oss:// is resolved inside Bailian (header X-DashScope-OssResourceResolve).
 * https is allowed only on an explicit mainland-reachable host
 * (BAILIAN_PUBLIC_MEDIA_BASE). *.pages.dev, *.workers.dev, and localhost are
 * refused: Aliyun egress returns InvalidURL.ConnectionRefused for them.
 */
export function assertDashScopeInputUrl(raw, publicBase) {
  const text = String(raw || '').trim();
  if (text.startsWith('oss://')) {
    const rest = text.slice('oss://'.length);
    if (!rest || rest.startsWith('/') || rest.includes('..') || /[\s?#]/.test(rest)) {
      throw fail('bailian_unreachable_input');
    }
    return text;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw fail('bailian_unreachable_input');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('bailian_unreachable_input');
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'pages.dev' ||
    host.endsWith('.pages.dev') ||
    host === 'workers.dev' ||
    host.endsWith('.workers.dev') ||
    host.endsWith('.r2.dev')
  ) {
    throw fail('bailian_unreachable_input');
  }
  const base = normalizePublicMediaBase(publicBase);
  if (!base || url.origin !== base) throw fail('bailian_unreachable_input');
  return url.toString();
}

export function normalizePublicMediaBase(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return '';
  let url;
  try {
    url = new URL(text);
  } catch {
    throw fail('bailian_bad_base');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw fail('bailian_bad_base');
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'pages.dev' ||
    host.endsWith('.pages.dev') ||
    host === 'workers.dev' ||
    host.endsWith('.workers.dev') ||
    host.endsWith('.r2.dev')
  ) {
    throw fail('bailian_bad_base');
  }
  return url.origin;
}

export function resolvePublicMediaBase(env) {
  const raw = env && typeof env.BAILIAN_PUBLIC_MEDIA_BASE === 'string' ? env.BAILIAN_PUBLIC_MEDIA_BASE : '';
  return normalizePublicMediaBase(raw);
}

export function buildSynthesisRequest(runtime, { imageUrl, videoUrl }) {
  const image = assertDashScopeInputUrl(imageUrl, runtime && runtime.publicMediaBase);
  const video = assertDashScopeInputUrl(videoUrl, runtime && runtime.publicMediaBase);
  return {
    url: `${runtime.base}/services/aigc/image2video/video-synthesis`,
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
      'X-DashScope-OssResourceResolve': 'enable',
    },
    body: {
      model: runtime.model,
      input: {
        image_url: image,
        video_url: video,
        watermark: Boolean(runtime.watermark),
      },
      parameters: {
        mode: runtime.mode,
      },
    },
  };
}

function authHeaders(runtime) {
  return { Authorization: `Bearer ${runtime.apiKey}` };
}

function providerCode(raw) {
  const text = String(raw || 'error')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40);
  return text || 'error';
}

function providerMessage(body) {
  if (!body || typeof body !== 'object') return '';
  const direct = body.message || body.output?.message || '';
  return String(direct).replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function bailianError(status, body, phase) {
  const err = fail('bailian_error');
  err.httpStatus = status;
  err.phase = phase;
  err.providerCode = providerCode((body && (body.code || body.output?.code)) || `http_${status || 0}`);
  err.providerMessage = providerMessage(body);
  const transientStatus = status === 429 || status >= 500 || status === 0;
  err.transient = phase !== 'synthesis' && transientStatus;
  return err;
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
    const wrapped = bailianError(0, { message: err && err.name ? err.name : 'network' }, phase);
    wrapped.cause = err;
    throw wrapped;
  }
  const json = await readJson(res);
  if (!res.ok) throw bailianError(res.status, json, phase);
  return json;
}

function assertAliyunHost(raw, { httpsOnly, code }) {
  let url;
  try {
    url = new URL(String(raw || ''));
  } catch {
    throw fail(code);
  }
  const https = url.protocol === 'https:';
  const http = url.protocol === 'http:';
  if (httpsOnly ? !https : !https && !http) throw fail(code);
  if (url.username || url.password) throw fail(code);
  const host = url.hostname.toLowerCase();
  const allowed = host === 'aliyuncs.com' || host.endsWith('.aliyuncs.com') || host.endsWith('.aliyun.com');
  if (!allowed) throw fail(code);
  return url;
}

export function assertUploadHost(raw) {
  return assertAliyunHost(raw, { httpsOnly: true, code: 'bailian_bad_upload' }).origin;
}

export function assertResultVideoUrl(raw) {
  const url = assertAliyunHost(raw, { httpsOnly: false, code: 'bailian_bad_result' });
  return url.toString();
}

function policyUrl(base, model) {
  return `${base}/uploads?action=getPolicy&model=${encodeURIComponent(model)}`;
}

async function getUploadPolicy(runtime, fetchImpl) {
  const headers = { ...authHeaders(runtime), 'Content-Type': 'application/json' };
  try {
    const json = await requestJson(fetchImpl, policyUrl(runtime.base, runtime.model), { method: 'GET', headers }, 'upload');
    if (json && json.data && json.data.upload_host) return json.data;
    throw bailianError(502, json, 'upload');
  } catch (err) {
    const classic = CLASSIC_DASHSCOPE_BASE;
    const canFallback = err && err.httpStatus === 404 && runtime.base !== classic;
    if (!canFallback) throw err;
    const json = await requestJson(fetchImpl, policyUrl(classic, runtime.model), { method: 'GET', headers }, 'upload');
    if (json && json.data && json.data.upload_host) return json.data;
    throw bailianError(502, json, 'upload');
  }
}

function safeFileName(name) {
  const text = String(name || 'file.bin').replace(/[^A-Za-z0-9._-]/g, '');
  return text.slice(0, 80) || 'file.bin';
}

export async function uploadTempFile(runtime, fetchImpl, file) {
  const policy = await getUploadPolicy(runtime, fetchImpl);
  const host = assertUploadHost(policy.upload_host);
  const dir = String(policy.upload_dir || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\\/g, '/');
  if (!dir || dir.includes('..') || dir.includes('//')) throw fail('bailian_bad_upload');
  const filename = safeFileName(file.filename);
  const key = `${dir}/${filename}`;
  const form = new FormData();
  form.append('OSSAccessKeyId', String(policy.oss_access_key_id || ''));
  form.append('Signature', String(policy.signature || ''));
  form.append('policy', String(policy.policy || ''));
  form.append('x-oss-object-acl', String(policy.x_oss_object_acl || 'private'));
  form.append('x-oss-forbid-overwrite', String(policy.x_oss_forbid_overwrite || 'true'));
  form.append('key', key);
  form.append('success_action_status', '200');
  form.append('file', new Blob([file.bytes], { type: file.contentType || 'application/octet-stream' }), filename);
  let res;
  try {
    res = await fetchImpl(host, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    const wrapped = bailianError(0, { message: err && err.name ? err.name : 'network' }, 'upload');
    wrapped.cause = err;
    throw wrapped;
  }
  if (res.status !== 200 && res.status !== 204) {
    const json = await readJson(res);
    throw bailianError(res.status, json, 'upload');
  }
  return `oss://${key}`;
}

export async function submitAnimateMove(runtime, fetchImpl, { imageUrl, videoUrl }) {
  const req = buildSynthesisRequest(runtime, { imageUrl, videoUrl });
  const json = await requestJson(
    fetchImpl,
    req.url,
    { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) },
    'synthesis',
  );
  const taskId = json && json.output && json.output.task_id;
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(taskId)) {
    throw bailianError(502, json, 'synthesis');
  }
  return { taskId, taskStatus: json.output.task_status || 'PENDING', requestId: json.request_id || '' };
}

export async function getAnimateTask(runtime, fetchImpl, taskId) {
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(taskId)) throw fail('bailian_bad_task');
  const json = await requestJson(
    fetchImpl,
    `${runtime.base}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'GET', headers: authHeaders(runtime) },
    'poll',
  );
  return json;
}

export async function downloadResultVideo(fetchImpl, videoUrl, maxBytes) {
  const url = assertResultVideoUrl(videoUrl);
  let res;
  try {
    res = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(120_000) });
  } catch (err) {
    const wrapped = bailianError(0, { message: err && err.name ? err.name : 'network' }, 'download');
    wrapped.cause = err;
    throw wrapped;
  }
  if (!res.ok) {
    throw bailianError(res.status, null, 'download');
  }
  const declared = Number(res.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw fail('video_too_large');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw fail('video_too_large');
  return bytes;
}

export function redactDetail(message, apiKey) {
  let text = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (apiKey && text.includes(apiKey)) text = text.split(apiKey).join('[redacted]');
  return text;
}
