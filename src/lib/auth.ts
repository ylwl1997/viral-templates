import { SITE, type Lang, pathFor } from './site';

/** Absolute apex origin (no trailing slash). Account login always happens here in P0. */
export function apexOrigin(): string {
  return SITE.url.replace(/\/$/, '');
}

/** Absolute account path on apex (EN/ZH). */
export function apexAccountHref(lang: Lang, sub: '' | 'sign-in' | 'creations' | 'credits' | 'settings' = ''): string {
  const path =
    sub === ''
      ? pathFor(lang, '/account/')
      : pathFor(lang, `/account/${sub}/`);
  return `${apexOrigin()}${path}`;
}

/** Sign-in URL on apex with safe next (relative path preferred). */
export function apexSignInHref(lang: Lang, nextPath?: string): string {
  const base = apexAccountHref(lang, 'sign-in');
  if (!nextPath) return base;
  const next = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
  return `${base}?next=${encodeURIComponent(next)}`;
}

/** Initials from display name or email. */
export function initialsFrom(name?: string, email?: string): string {
  const src = (name || email || 'U').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
