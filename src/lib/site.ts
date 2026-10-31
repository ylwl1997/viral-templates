import type { Template } from './templates';

/** Apex host for Host-header / subdomain mapping (no trailing slash). Ops only — not customer copy. */
export const SITE_APEX =
  (import.meta.env.PUBLIC_SITE_APEX as string | undefined)?.replace(/^https?:\/\//, '').replace(/\/$/, '') ||
  'viral-templates.pages.dev';

function retentionDays(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 365) return fallback;
  return n;
}

/** Customer-facing retention. Runtime object metadata uses the same defaults (PHOTO_/VIDEO_RETENTION_DAYS). */
const photoRetentionDays = retentionDays(import.meta.env.PUBLIC_PHOTO_RETENTION_DAYS as string | undefined, 7);
const videoRetentionDays = retentionDays(import.meta.env.PUBLIC_VIDEO_RETENTION_DAYS as string | undefined, 30);

export const SITE = {
  name: 'Viral Templates',
  shortName: 'ViralTemplates',
  /** Canonical origin for sitemap / shared legal pages (https). */
  url: `https://${SITE_APEX}`,
  apex: SITE_APEX,
  taglineEn: 'Short vertical clips from a photo you already have.',
  taglineZh: '用已有的照片，做一条竖屏短片。',
  ga4Id: (import.meta.env.PUBLIC_GA4_MEASUREMENT_ID as string) || '',
  adsterraSocialBarZone:
    (import.meta.env.PUBLIC_ADSTERRA_SOCIAL_BAR_ZONE as string) ||
    'YOUR_ADSTERRA_SOCIAL_BAR_ZONE_ID',
  falConfigured: false,
  waffoConfigured: false,
  /** Static build flag. Set PUBLIC_R2_CONFIGURED=1 after the MEDIA bucket is bound. Runtime storage follows env.MEDIA even when this stays false. */
  r2Configured: (import.meta.env.PUBLIC_R2_CONFIGURED as string | undefined) === '1',
  photoRetentionDays,
  videoRetentionDays,
  pricing: {
    oneShotUsd: 2.99,
    kissCamOneShotUsd: 4.99,
    creditPerGenerate: 1,
    packs: [
      { credits: 5, usd: 9.99, label: 'Starter' },
      { credits: 15, usd: 24.99, label: 'Creator', popular: true },
      { credits: 40, usd: 59.99, label: 'Studio' },
    ],
  },
  disclaimerEn:
    `Adult consent only · no minors. Independent AI remix tools — not official Coldplay / Karol G / CapCut / any label. Kiss Cam uses no real concert footage. Ceiling Fan: never strap a phone to a fan. Photos deleted ~${photoRetentionDays} days; finished clips ~${videoRetentionDays} days (see Privacy).`,
  disclaimerZh:
    `仅限成人同意照片 · 禁止未成年人。独立 AI remix · 非 Coldplay / Karol G / CapCut 官方。Kiss Cam 不含真实演唱会素材。吊扇模板：切勿把手机绑在风扇上。照片约 ${photoRetentionDays} 天删除，成片约 ${videoRetentionDays} 天（见隐私政策）。`,
} as const;

export type Lang = 'en' | 'zh';

/** Internal path helper for template shells (`/t/…` or `/zh/t/…`). Not shown in customer copy. */
export function keywordPath(
  lang: Lang,
  slug: string,
  sub: '' | 'create' | 'account' | 'account/sign-in' | 'account/creations' | 'account/credits' | 'account/settings' = '',
): string {
  const base = lang === 'zh' ? `/zh/t/${slug}` : `/t/${slug}`;
  if (!sub) return `${base}/`;
  return `${base}/${sub}/`;
}

/** Locale-neutral shared path → localized href. */
export function pathFor(lang: Lang, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === 'zh') {
    if (clean === '/' || clean === '') return '/zh/';
    return `/zh${clean.endsWith('/') ? clean : `${clean}/`}`;
  }
  if (clean === '/' || clean === '') return '/';
  return clean.endsWith('/') ? clean : `${clean}/`;
}

/** Production subdomain URL (ops / README only). */
export function subdomainUrl(slug: string, path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `https://${slug}.${SITE.apex}${p.endsWith('/') || p.includes('.') ? p : `${p}/`}`;
}

export function tName(t: Template, lang: Lang): string {
  return lang === 'zh' ? t.displayNameZh : t.displayName;
}

export function tField<K extends keyof Template>(t: Template, lang: Lang, enKey: K, zhKey: K): Template[K] {
  return lang === 'zh' ? t[zhKey] : t[enKey];
}
