/**
 * Pure helpers for the in-page Google sign-in dialog.
 * Safe to import from Node tests and from /scripts/login-modal.js.
 */

const SIGN_IN_PATH = /^\/(?:zh\/)?(?:t\/[a-z0-9-]+\/)?account\/sign-in\/$/;
export const AUTH_MESSAGE_TYPE = 'vt-auth';
export const AUTH_CHANNEL = 'vt-auth';

/** Relative path only. Mirrors functions/_lib/session.js safeNext. */
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

export function isSignInPath(pathname) {
  const path = typeof pathname === 'string' ? pathname.split('?')[0].split('#')[0] : '';
  const withSlash = path.endsWith('/') ? path : `${path}/`;
  return SIGN_IN_PATH.test(withSlash);
}

export function safeSignInPath(raw) {
  const path = safeNext(typeof raw === 'string' ? raw : '', '/account/sign-in/');
  const pathname = path.split('?')[0].split('#')[0];
  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  if (SIGN_IN_PATH.test(withSlash)) return withSlash;
  return '/account/sign-in/';
}

/** Same-origin start URL. `popup` asks the callback to handshake instead of navigating. */
export function googleStartUrl({ next, from, popup } = {}) {
  const params = new URLSearchParams();
  params.set('next', safeNext(next, '/account/'));
  params.set('from', safeSignInPath(from));
  if (popup) params.set('popup', '1');
  return `/api/auth/google/start?${params.toString()}`;
}

/** Centered features string for window.open. Does not set noopener. */
export function popupFeatures(screen) {
  const box = screen || {};
  const w = 480;
  const h = 640;
  const outerW = Number(box.outerWidth) || Number(box.width) || w;
  const outerH = Number(box.outerHeight) || Number(box.height) || h;
  const left = Math.max(0, Math.round((Number(box.x) || 0) + (outerW - w) / 2));
  const top = Math.max(0, Math.round((Number(box.y) || 0) + (outerH - h) / 2));
  return `popup=yes,width=${w},height=${h},left=${left},top=${top}`;
}

/** Accept a same-origin vt-auth message. Returns null for anything else. */
export function acceptAuthMessage(event, expectedOrigin) {
  if (!event || typeof expectedOrigin !== 'string' || !expectedOrigin) return null;
  if (event.origin !== expectedOrigin) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.type !== AUTH_MESSAGE_TYPE) return null;
  const ok = data.ok === true;
  return {
    ok,
    error: ok ? '' : typeof data.error === 'string' ? data.error : '',
    next: safeNext(typeof data.next === 'string' ? data.next : '', '/account/'),
  };
}
