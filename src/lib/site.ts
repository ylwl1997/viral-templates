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
  name: 'Swaystill',
  shortName: 'Swaystill',
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
  checkoutConfigured: false,
  /** Google sign-in is decided per request (`GET /api/auth/session`), not at build time. */
  /** Static build flag. Set PUBLIC_R2_CONFIGURED=1 after the MEDIA bucket is bound. Runtime storage follows env.MEDIA even when this stays false. */
  r2Configured: (import.meta.env.PUBLIC_R2_CONFIGURED as string | undefined) === '1',
  photoRetentionDays,
  videoRetentionDays,
  pricing: {
    /** One credit is about one second. Pack dollar amounts are the live prices. */
    creditPerSecond: 1,
    packs: [
      { id: 'starter', label: 'Starter', labelZh: '入门', credits: 60, cents: 599, usd: 5.99 },
      { id: 'mid', label: 'Mid', labelZh: '进阶', credits: 180, cents: 1499, usd: 14.99, popular: true },
      { id: 'large', label: 'Large', labelZh: '大包', credits: 600, cents: 3999, usd: 39.99 },
    ],
  },
  disclaimerEn:
    `Adult consent only · no minors. Independent AI remix tools — not official Coldplay / Karol G / CapCut / any label. Kiss Cam uses no real concert footage. Ceiling Fan: never strap a phone to a fan. Photos deleted ~${photoRetentionDays} days; finished clips ~${videoRetentionDays} days (see Privacy).`,
  disclaimerZh:
    `仅限成人同意照片 · 禁止未成年人。独立 AI remix · 非 Coldplay / Karol G / CapCut 官方。Kiss Cam 不含真实演唱会素材。吊扇模板：切勿把手机绑在风扇上。照片约 ${photoRetentionDays} 天删除，成片约 ${videoRetentionDays} 天（见隐私政策）。`,
} as const;

export type Lang = 'en' | 'zh';

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** Customer-facing pack list. Same three packs, both languages. */
export function packPriceList(lang: Lang): string {
  const parts = SITE.pricing.packs.map((p) =>
    lang === 'zh'
      ? `${p.label} ${formatUsd(p.usd)}（${p.credits} 积分）`
      : `${p.label} ${formatUsd(p.usd)} (${p.credits} credits)`,
  );
  if (lang === 'zh' || parts.length < 2) return parts.join(lang === 'zh' ? '，' : ', ');
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

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
