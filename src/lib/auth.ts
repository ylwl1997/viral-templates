import { type Lang, pathFor } from './site';

/** Relative account href (EN/ZH). Same backend session on every brand shell. */
export function accountHref(lang: Lang, sub: '' | 'sign-in' | 'creations' | 'credits' | 'settings' = ''): string {
  if (sub === '') return pathFor(lang, '/account/');
  return pathFor(lang, `/account/${sub}/`);
}

/** Relative sign-in href with safe next (relative path only). */
export function signInHref(lang: Lang, nextPath?: string): string {
  const base = accountHref(lang, 'sign-in');
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
