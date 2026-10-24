import type { Template } from './templates';

/** Apex host for directory + subdomain mapping (no trailing slash). */
export const SITE_APEX =
  (import.meta.env.PUBLIC_SITE_APEX as string | undefined)?.replace(/^https?:\/\//, '').replace(/\/$/, '') ||
  'viral-templates.pages.dev';

export const SITE = {
  name: 'Viral Templates',
  shortName: 'ViralTemplates',
  /** Canonical origin for directory / sitemap (https). */
  url: `https://${SITE_APEX}`,
  apex: SITE_APEX,
  taglineEn: 'One keyword · one subdomain',
  taglineZh: '一词一子域',
  ga4Id: (import.meta.env.PUBLIC_GA4_MEASUREMENT_ID as string) || '',
  adsterraSocialBarZone:
    (import.meta.env.PUBLIC_ADSTERRA_SOCIAL_BAR_ZONE as string) ||
    'YOUR_ADSTERRA_SOCIAL_BAR_ZONE_ID',
  falConfigured: false,
  waffoConfigured: false,
  photoRetentionDays: 30,
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
    'Adult consent only · no minors. Independent AI remix tools — not official Coldplay / Karol G / CapCut / any label. Kiss Cam uses no real concert footage. Ceiling Fan: never strap a phone to a fan. Photos deleted ~30 days (see Privacy).',
  disclaimerZh:
    '仅限成人同意照片 · 禁止未成年人。独立 AI remix · 非 Coldplay / Karol G / CapCut 官方。Kiss Cam 不含真实演唱会素材。吊扇模板：切勿把手机绑在风扇上。照片约 30 天删除（见隐私政策）。',
} as const;

export type Lang = 'en' | 'zh';

/** Path under path-fallback `/t/{slug}/…` (or `/zh/t/{slug}/…`). */
export function keywordPath(lang: Lang, slug: string, sub: '' | 'create' = ''): string {
  const base = lang === 'zh' ? `/zh/t/${slug}` : `/t/${slug}`;
  if (sub === 'create') return `${base}/create/`;
  return `${base}/`;
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

/** Production subdomain URL (documentational; Pages path fallback used until DNS). */
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
