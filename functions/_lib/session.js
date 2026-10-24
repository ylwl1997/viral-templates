/** HttpOnly session helpers for Viral Templates Pages Functions. Web Crypto only. */

export const SESSION_COOKIE = 'vt_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
/** Public on purpose. Used only for localhost and *.pages.dev when AUTH_SECRET is unset. */
export const PREVIEW_AUTH_SECRET = 'viral-templates-preview-session-v1';

const text = new TextEncoder();

export function safeNext(raw, fallback = '/account/') {
  if (typeof raw !== 'string') return fallback;
  let value = raw.trim();
  if (!value || value.length > 512) return fallback;
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      return fallback;
    }
  }
  if (!value || value.length > 512) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value.includes('\\') || value.includes('://')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%?#]*$/.test(value)) return fallback;
  return value;
}

export function readCookie(header, name) {
  const source = header || '';
  for (const part of source.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

export function cookiePair(name, value, { maxAge, secure, httpOnly = true }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function isHttps(request) {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  const proto = request.headers.get('x-forwarded-proto') || '';
  return proto.split(',')[0].trim().toLowerCase() === 'https';
}

function bytesToB64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', text.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signToken(payload, secret) {
  if (!secret || String(secret).length < 16) throw new Error('auth_secret_too_short');
  const body = bytesToB64url(text.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, text.encode(body));
  return `${body}.${bytesToB64url(sig)}`;
}

export async function verifyToken(token, secret) {
  if (!secret || typeof token !== 'string' || !token.includes('.')) return null;
  const dot = token.indexOf('.');
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig || token.slice(dot + 1).includes('.')) return null;
  let sigBytes;
  try {
    sigBytes = b64urlToBytes(sig);
  } catch {
    return null;
  }
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, text.encode(body));
  if (!ok) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    if (!json || typeof json !== 'object') return null;
    if (json.exp && Number(json.exp) < Math.floor(Date.now() / 1000)) return null;
    return json;
  } catch {
    return null;
  }
}

export function resolveAuthSecret(env, hostname) {
  const configured = typeof env?.AUTH_SECRET === 'string' ? env.AUTH_SECRET.trim() : '';
  if (configured.length >= 16) return { secret: configured, previewFallback: false };
  const preview =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.pages.dev');
  if (preview) return { secret: PREVIEW_AUTH_SECRET, previewFallback: true };
  return { secret: null, previewFallback: false };
}

export function previewLoginAllowed(env, hostname) {
  if (env?.AUTH_PREVIEW_LOGIN === '0') return false;
  if (env?.AUTH_PREVIEW_LOGIN === '1') return true;
  const google = Boolean(env?.GOOGLE_CLIENT_ID && env?.GOOGLE_CLIENT_SECRET);
  const preview =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.pages.dev');
  return preview && !google;
}

export function jsonNoStore(body, status = 200, setCookies = []) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  for (const c of setCookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function stableUserId(provider, providerUserId) {
  const digest = await crypto.subtle.digest('SHA-256', text.encode(`${provider}:${providerUserId}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `u_${hex.slice(0, 20)}`;
}

export function cleanPreviewProfile(body) {
  const emailRaw = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const nameRaw = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = emailRaw || 'preview@viral-templates.local';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email !== 'preview@viral-templates.local') {
    return null;
  }
  const name = (nameRaw || email.split('@')[0] || 'Preview User').slice(0, 80);
  return { email, name };
}

export async function issueSessionCookie(request, env, user) {
  const host = new URL(request.url).hostname;
  const { secret } = resolveAuthSecret(env, host);
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    user_id: user.user_id,
    email: user.email || '',
    name: user.name || '',
    avatar_url: user.avatar_url || '',
    providers: user.providers || ['preview'],
    iat: now,
    exp: now + SESSION_MAX_AGE,
  };
  const token = await signToken(payload, secret);
  return cookiePair(SESSION_COOKIE, token, {
    maxAge: SESSION_MAX_AGE,
    secure: isHttps(request),
    httpOnly: true,
  });
}

export async function readSession(request, env) {
  const host = new URL(request.url).hostname;
  const { secret } = resolveAuthSecret(env, host);
  if (!secret) return null;
  const token = readCookie(request.headers.get('cookie') || '', SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifyToken(token, secret);
  if (!payload || !payload.user_id) return null;
  return {
    user_id: String(payload.user_id),
    email: typeof payload.email === 'string' ? payload.email : '',
    name: typeof payload.name === 'string' ? payload.name : '',
    avatar_url: typeof payload.avatar_url === 'string' ? payload.avatar_url : '',
    providers: Array.isArray(payload.providers) ? payload.providers : ['preview'],
  };
}

export function clearSessionCookie(request) {
  return cookiePair(SESSION_COOKIE, '', {
    maxAge: 0,
    secure: isHttps(request),
    httpOnly: true,
  });
}

export function authStatus(request, env) {
  const host = new URL(request.url).hostname;
  const secret = resolveAuthSecret(env, host);
  const google = Boolean(env?.GOOGLE_CLIENT_ID && env?.GOOGLE_CLIENT_SECRET);
  return {
    ok: true,
    google,
    preview: previewLoginAllowed(env, host) && Boolean(secret.secret),
    auth_secret: !secret.previewFallback && Boolean(secret.secret),
    preview_secret_fallback: secret.previewFallback,
  };
}
