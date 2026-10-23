export const SITE = {
  name: 'Viral Templates',
  shortName: 'ViralTemplates',
  /** pages.dev until custom domain is attached */
  url: 'https://viral-templates.pages.dev',
  taglineEn: 'One wall · three viral AI video templates',
  taglineZh: '一词多站合一 · 三个爆款 AI 视频模板墙',
  /** Empty until a real GA4 property exists — do not invent a G- ID. */
  ga4Id: (import.meta.env.PUBLIC_GA4_MEASUREMENT_ID as string) || '',
  /** Placeholder — paste Adsterra Social Bar zone when ready. */
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
    'Adult consent only · no minors. Not official Coldplay / Karol G / CapCut / any label. Kiss Cam uses no real concert footage. Ceiling Fan: never strap a phone to a fan. Photos deleted ~30 days (see Privacy).',
  disclaimerZh:
    '仅限成人同意照片 · 禁止未成年人。非 Coldplay / Karol G / CapCut 官方。Kiss Cam 不含真实演唱会素材。吊扇模板：切勿把手机绑在风扇上。照片约 30 天删除（见隐私政策）。',
} as const;

export type Lang = 'en' | 'zh';

export type TemplateId = 'bby-wow' | 'kiss-cam' | 'ceiling-fan';

export const TEMPLATES = [
  {
    id: 'bby-wow' as const,
    slug: 'bby-wow',
    nameEn: 'Bby Wow AI',
    nameZh: 'Bby Wow AI',
    alias: 'Dime Dime Baby',
    photos: 1,
    durationEn: '~10s',
    durationZh: '约 10 秒',
    taglineEn: '1 photo → vertical party-dance clip',
    taglineZh: '1 张照片 → 竖屏派对舞短片',
    createPath: '/create/bby-wow/',
    accent: 'magenta',
    badgeEn: '1 photo',
    badgeZh: '1 张照片',
  },
  {
    id: 'kiss-cam' as const,
    slug: 'kiss-cam',
    nameEn: 'Coldplay Kiss Cam AI',
    nameZh: 'Coldplay Kiss Cam AI',
    alias: 'Stadium jumbotron',
    photos: 2,
    durationEn: '~11–12s',
    durationZh: '约 11–12 秒',
    taglineEn: '2 photos → stadium kiss-cam remix (no concert footage)',
    taglineZh: '2 张照片 → 球场大屏蹭到风（无演唱会素材）',
    createPath: '/create/kiss-cam/',
    accent: 'amber',
    badgeEn: '2 photos',
    badgeZh: '2 张照片',
  },
  {
    id: 'ceiling-fan' as const,
    slug: 'ceiling-fan',
    nameEn: 'Ceiling Fan Transition AI',
    nameZh: 'Ceiling Fan Transition AI',
    alias: 'Outfit change',
    photos: 1,
    durationEn: '~12–15s',
    durationZh: '约 12–15 秒',
    taglineEn: '1 photo → fan-wipe outfit change (AI only — no real fan)',
    taglineZh: '1 张照片 → 吊扇换装转场（纯 AI · 勿绑真风扇）',
    createPath: '/create/ceiling-fan/',
    accent: 'cyan',
    badgeEn: '1 photo',
    badgeZh: '1 张照片',
  },
] as const;

/** Locale-neutral path → localized href (trailing slash). */
export function pathFor(lang: Lang, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === 'zh') {
    if (clean === '/' || clean === '') return '/zh/';
    return `/zh${clean.endsWith('/') ? clean : `${clean}/`}`;
  }
  if (clean === '/' || clean === '') return '/';
  return clean.endsWith('/') ? clean : `${clean}/`;
}

export const NAV = [
  { href: '/', labelEn: 'Templates', labelZh: '模板墙' },
  { href: '/pricing/', labelEn: 'Pricing', labelZh: '价格' },
  { href: '/how-it-works/', labelEn: 'How it works', labelZh: '如何使用' },
  { href: '/faq/', labelEn: 'FAQ', labelZh: '常见问题' },
  { href: '/blog/', labelEn: 'Blog', labelZh: '博客' },
] as const;

export const BLOG_POSTS = [
  {
    slug: 'what-is-bby-wow-ai',
    titleEn: 'What is Bby Wow AI? (trend + 1-photo product)',
    titleZh: '什么是 Bby Wow AI？',
    date: '2026-10-20',
    descEn:
      'Trend timeline, 1 photo → ~10s party dance, adult consent, and how it differs from CapCut templates (sourced notes as of Oct 2026).',
    minutes: 9,
  },
  {
    slug: 'how-to-make-kiss-cam-from-two-photos',
    titleEn: 'How to make a Kiss Cam clip from two photos',
    titleZh: '如何用两张照片做 Kiss Cam',
    date: '2026-10-21',
    descEn:
      'Checklist: two adult-consent photos (people or pets), credits, ~11–12s stadium-style AI remix — no official Coldplay footage.',
    minutes: 8,
  },
  {
    slug: 'ceiling-fan-transition-vs-capcut',
    titleEn: 'Ceiling Fan Transition AI vs CapCut template',
    titleZh: '吊扇换装转场对比 CapCut',
    date: '2026-10-22',
    descEn:
      'Thick comparison table: one-photo AI vs CapCut multi-clip templates — time, skill, safety (never strap a phone to a fan), copyright (as of Oct 2026).',
    minutes: 10,
  },
] as const;

export function getTemplate(id: TemplateId) {
  return TEMPLATES.find((t) => t.id === id)!;
}
