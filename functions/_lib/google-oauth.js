/**
 * Google OAuth authorization-code helpers (PKCE + signed state cookie).
 *
 * Redirect URI is always the current host + /api/auth/google/callback.
 * Register that exact URI for each host (no wildcards). Path-style
 * /t/{slug}/ on the apex does not need its own URI.
 *
 * Popup sign-in uses the same redirect URI. `popup=1` on start is stored
 * in the state cookie. The callback then returns a tiny HTML page that
 * postMessages the opener and closes, instead of navigating to `next`.
 */

import {
  cookiePair,
  googleConfigured,
  isHttps,
  readCookie,
  resolveAuthSecret,
  safeNext,
  signToken,
  stableUserId,
  verifyToken,
} from './session.js';

export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';
export const GOOGLE_START_PATH = '/api/auth/google/start';
export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
export const OAUTH_STATE_COOKIE = 'vt_oauth';
export const OAUTH_STATE_MAX_AGE = 60 * 10;

const SIGN_IN_PATH = /^\/(?:zh\/)?(?:t\/[a-z0-9-]+\/)?account\/sign-in\/$/;
const SIGN_IN_ERRORS = new Set(['google_denied', 'google_failed', 'google_state', 'google_unavailable']);
const text = new TextEncoder();

function bytesToB64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function oneLine(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function sameString(a, b) {
  const x = text.encode(String(a));
  const y = text.encode(String(b));
  const n = Math.max(x.length, y.length);
  let diff = x.length === y.length ? 0 : 1;
  for (let i = 0; i < n; i += 1) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export function randomToken(size = 32) {
  return bytesToB64url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function codeChallengeS256(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', text.encode(verifier));
  return bytesToB64url(new Uint8Array(digest));
}

/** https origin, or http on localhost only. Empty when the host must not start OAuth. */
export function oauthOrigin(request) {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:' && isLocalHost(url.hostname)) return url.origin;
  if (isHttps(request) && (url.protocol === 'http:' || url.protocol === 'https:')) {
    const port = url.port ? `:${url.port}` : '';
    return `https://${url.hostname}${port}`;
  }
  return '';
}

export function googleRedirectUri(origin) {
  if (typeof origin !== 'string' || !origin) return '';
  try {
    const url = new URL(origin);
    if (url.origin !== origin) return '';
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return `${url.origin}${GOOGLE_CALLBACK_PATH}`;
  } catch {
    return '';
  }
}

export function safeSignInPath(raw) {
  const path = safeNext(typeof raw === 'string' ? raw : '', '/account/sign-in/');
  const pathname = path.split('?')[0].split('#')[0];
  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  if (SIGN_IN_PATH.test(withSlash)) return withSlash;
  return '/account/sign-in/';
}

export function signInErrorLocation(from, error, next) {
  const params = new URLSearchParams();
  params.set('error', SIGN_IN_ERRORS.has(error) ? error : 'google_failed');
  params.set('next', safeNext(next));
  return `${safeSignInPath(from)}?${params.toString()}`;
}

export function redirectNoStore(location, setCookies = []) {
  const headers = new Headers({
    location,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  for (const cookie of setCookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}

export function clearOauthStateCookie(request) {
  return cookiePair(OAUTH_STATE_COOKIE, '', {
    maxAge: 0,
    secure: isHttps(request),
    httpOnly: true,
  });
}

export function realAuthSecret(env, hostname) {
  const resolved = resolveAuthSecret(env, hostname);
  if (!resolved.secret || resolved.previewFallback) return null;
  return resolved.secret;
}

export async function issueOauthStateCookie(request, env, fields) {
  const host = new URL(request.url).hostname;
  const secret = realAuthSecret(env, host);
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const token = await signToken(
    {
      typ: 'google_oauth',
      state: fields.state,
      verifier: fields.verifier,
      next: safeNext(fields.next),
      from: safeSignInPath(fields.from),
      popup: fields.popup === true,
      iat: now,
      exp: now + OAUTH_STATE_MAX_AGE,
    },
    secret,
  );
  return cookiePair(OAUTH_STATE_COOKIE, token, {
    maxAge: OAUTH_STATE_MAX_AGE,
    secure: isHttps(request),
    httpOnly: true,
  });
}

export async function readOauthState(request, env) {
  const host = new URL(request.url).hostname;
  const secret = realAuthSecret(env, host);
  if (!secret) return null;
  const token = readCookie(request.headers.get('cookie') || '', OAUTH_STATE_COOKIE);
  if (!token) return null;
  const payload = await verifyToken(token, secret);
  if (!payload || payload.typ !== 'google_oauth') return null;
  if (typeof payload.state !== 'string' || typeof payload.verifier !== 'string') return null;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(payload.verifier)) return null;
  return {
    state: payload.state,
    verifier: payload.verifier,
    next: safeNext(payload.next),
    from: safeSignInPath(payload.from),
    popup: payload.popup === true,
  };
}

export function oauthStateMatches(stored, presented) {
  if (!stored || typeof presented !== 'string') return false;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(presented)) return false;
  return sameString(stored, presented);
}

export async function buildAuthorizeUrl({ clientId, redirectUri, state, verifier }) {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', await codeChallengeS256(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export function cleanAuthCode(raw) {
  if (typeof raw !== 'string') return '';
  const code = raw.trim();
  if (!code || code.length > 2048) return '';
  if (/[\s\u0000-\u001f\u007f]/.test(code) || code.includes('://')) return '';
  return code;
}

function cleanEmail(profile) {
  const verified = profile.email_verified === true || profile.email_verified === 'true';
  if (!verified) return '';
  const email = oneLine(profile.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function cleanPicture(raw) {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value || value.length > 1024) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

/** Google userinfo → { sub, email, name, picture } or null. */
export function mapGoogleProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const sub = typeof profile.sub === 'string' ? profile.sub.trim() : '';
  if (!sub || sub.length > 255 || /[\s\u0000-\u001f\u007f]/.test(sub)) return null;
  const email = cleanEmail(profile);
  let name = oneLine(profile.name, 80);
  if (!name && email) name = oneLine(email.split('@')[0], 80);
  if (!name) name = 'Member';
  return { sub, email, name, picture: cleanPicture(profile.picture) };
}

export async function sessionUserFromGoogle(profile) {
  const mapped = mapGoogleProfile(profile);
  if (!mapped) return null;
  return {
    user_id: await stableUserId('google', mapped.sub),
    email: mapped.email,
    name: mapped.name,
    avatar_url: mapped.picture,
    providers: ['google'],
  };
}

function fetchSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(10000);
  }
  return undefined;
}

export async function exchangeGoogleCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
  codeVerifier,
  fetchImpl = globalThis.fetch,
}) {
  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });
    const res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
      signal: fetchSignal(),
    });
    if (!res || res.status !== 200) return null;
    const json = await res.json();
    const access = json && typeof json.access_token === 'string' ? json.access_token : '';
    if (!access || access.length > 8192 || /[\s]/.test(access)) return null;
    return access;
  } catch {
    return null;
  }
}

export async function fetchGoogleUserInfo(accessToken, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(GOOGLE_USERINFO_URL, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
      signal: fetchSignal(),
    });
    if (!res || res.status !== 200) return null;
    const json = await res.json();
    if (!json || typeof json !== 'object') return null;
    return json;
  } catch {
    return null;
  }
}

function htmlAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * HTML document for a popup that has already hit the registered callback URI.
 * Does not navigate the popup to a new OAuth redirect. The opener listens
 * for postMessage (target origin = this page) and BroadcastChannel `vt-auth`.
 */
export function oauthResultDocument({ ok, error, next, setCookies = [] }) {
  const success = ok === true;
  const payload = {
    type: 'vt-auth',
    ok: success,
    error: success ? '' : SIGN_IN_ERRORS.has(error) ? error : 'google_failed',
    next: safeNext(typeof next === 'string' ? next : ''),
  };
  const json = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const title = success ? 'Signed in' : 'Sign-in';
  const message = success ? 'Signed in. You can close this window.' : 'You can close this window.';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${title}</title>
</head>
<body>
<p>${message}</p>
<p><a href="${htmlAttr(payload.next)}">Continue</a></p>
<script>
(function () {
  var payload = ${json};
  var target = window.location.origin;
  try {
    if (window.opener && !window.opener.closed) window.opener.postMessage(payload, target);
  } catch (e) {}
  try {
    var channel = new BroadcastChannel('vt-auth');
    channel.postMessage(payload);
    channel.close();
  } catch (e) {}
  try { window.close(); } catch (e) {}
})();
</script>
</body>
</html>`;
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    'x-content-type-options': 'nosniff',
  });
  for (const cookie of setCookies) headers.append('set-cookie', cookie);
  return new Response(html, { status: 200, headers });
}

export function googleClient(env) {
  if (!googleConfigured(env)) return null;
  return {
    id: String(env.GOOGLE_CLIENT_ID).trim(),
    secret: String(env.GOOGLE_CLIENT_SECRET).trim(),
  };
}
