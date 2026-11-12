/** Template catalog. logo = public path to brand mark. Ops routing uses slug — never in customer copy. */

import { BBY_LIVE, FAN_LIVE, TINY_LIVE } from './liveCases';
import { getTemplate as sourceTemplate } from '../../functions/_lib/templates.js';

function liveTiming(slug: string) {
  const source = sourceTemplate(slug);
  const credits = source && source.creditCost;
  const durationSeconds = source && source.durationSeconds;
  if (!durationSeconds || !credits) throw new Error(`Live look ${slug} is missing a source duration`);
  return {
    durationSeconds,
    creditCost: credits,
    durationEn: `~${credits}s`,
    durationZh: `约 ${credits} 秒`,
  };
}

function livePhotoSlots(slug: string) {
  const source = sourceTemplate(slug);
  const slots = source && source.photoSlots;
  if (!source || source.photoCount < 2) return undefined;
  if (!slots || slots.length !== source.photoCount) {
    throw new Error(`${slug} photo slots do not match photoCount`);
  }
  return slots;
}

const bbyTiming = liveTiming('bby-wow');
const tinyTiming = liveTiming('tiny-desk');
const fanTiming = liveTiming('ceiling-fan');

export type TemplateStatus = 'live' | 'soon';

/** One upload slot. Create copy and the reference prompt both use these words. */
export type PhotoSlot = {
  labelEn: string;
  labelZh: string;
  replacesEn: string;
  replacesZh: string;
};

/** Hero composition — must visibly differ across live brands. */
export type HeroPreset = 'centered' | 'split' | 'editorial';
/** Type voice — weight / tracking / hero size temperament. */
export type TypeVoice = 'playful' | 'bold' | 'cool';
/** Card surface treatment. */
export type CardStyle = 'glow' | 'ribbon' | 'mesh' | 'soft';
/** Cover / illustration fill on gallery + hero visual. */
export type CoverStyle = 'orb' | 'stripes' | 'radial' | 'grid';
/** Fixed-layer ambience (noise / grid intensity via CSS). */
export type Ambience = 'none' | 'noise' | 'grid';

/** One before → after example. A second case is data: the look section lists every entry. */
export type TemplateCase = {
  id: string;
  labelEn: string;
  labelZh: string;
  /** Upload stills of the same pets as the result. */
  sources: readonly string[];
  resultPoster?: string;
  resultVideo?: string;
  noteEn?: string;
  noteZh?: string;
};

export type StoryBeat = {
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
};

export type StoryBlock = {
  eyebrowEn: string;
  eyebrowZh: string;
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
};

export type StoryDiy = {
  eyebrowEn: string;
  eyebrowZh: string;
  titleEn: string;
  titleZh: string;
  hardTitleEn: string;
  hardTitleZh: string;
  hardEn: string;
  hardZh: string;
  easyTitleEn: string;
  easyTitleZh: string;
  easyEn: string;
  easyZh: string;
};

/** Copy for a brand story. `layout` picks the page rhythm — party, stadium, or fan. */
export type TemplateStory = {
  layout: 'party' | 'stadium' | 'fan' | 'desk';
  lead: StoryBlock;
  support: StoryBlock;
  beats: readonly StoryBeat[];
  diy: StoryDiy;
};

export type FaqEntry = {
  id: string;
  qEn: string;
  qZh: string;
  aEn: string;
  aZh: string;
};

export type LivePack = {
  cases: readonly TemplateCase[];
  story: TemplateStory;
  faq: readonly FaqEntry[];
};

export function localizeFaq(items: readonly FaqEntry[] | undefined, lang: 'en' | 'zh') {
  return (items ?? []).map((item) => ({
    q: lang === 'zh' ? item.qZh : item.qEn,
    a: lang === 'zh' ? item.aZh : item.aEn,
  }));
}

/**
 * Per-brand theme. Required for every new site — logo+accent alone is not enough.
 * Kit structure stays shared; these fields drive distinct look (同构异貌).
 */
export type BrandTheme = {
  accent: 'magenta' | 'amber' | 'cyan' | 'violet' | 'rose' | 'lime' | 'orange' | 'sky' | 'slate';
  heroPreset: HeroPreset;
  typeVoice: TypeVoice;
  cardStyle: CardStyle;
  coverStyle: CoverStyle;
  ambience: Ambience;
};

export type Template = {
  slug: string;
  displayName: string;
  displayNameZh: string;
  status: TemplateStatus;
  photoCount: number;
  /** Minimum uploads. Optional roles may be left empty. */
  minPhotos?: number;
  /** Who each photo replaces. Required when photoCount is 2. */
  photoSlots?: readonly PhotoSlot[];
  /** Source clip length in seconds. Absent on unpublished looks. */
  durationSeconds?: number;
  /** Credits charged when a signed-in generate stores a photo. Derived from durationSeconds. */
  creditCost?: number;
  durationEn: string;
  durationZh: string;
  taglineEn: string;
  taglineZh: string;
  seoTitleEn: string;
  seoTitleZh: string;
  seoDescEn: string;
  seoDescZh: string;
  heroEn: string;
  heroZh: string;
  howEn: [string, string, string];
  howZh: [string, string, string];
  /** @deprecated use theme.accent — kept for gallery card class names */
  accent: BrandTheme['accent'];
  /** Public path to brand mark (svg/png). */
  logo: string;
  /** Optional 9:16 still for Live media slots (poster / fallback). */
  poster?: string;
  /** Optional muted looping demo clip for Live gallery and compare slots. */
  demoVideo?: string;
  /** Full brand theme — required; do not ship logo-only clones. */
  theme: BrandTheme;
  disclaimerEn: string;
  disclaimerZh: string;
  /** Before → after examples. Live templates ship at least one. */
  cases?: readonly TemplateCase[];
  /** Product story. Rendered with the layout named in `story.layout`. */
  story?: TemplateStory;
  /** On-page keyword questions for this look. */
  faq?: readonly FaqEntry[];
};

export const TEMPLATES: readonly Template[] = [
  {
    slug: 'bby-wow',
    displayName: 'Bby Wow',
    displayNameZh: 'Bby Wow',
    status: 'live',
    photoCount: 1,
    minPhotos: 1,
    ...bbyTiming,
    taglineEn: '1 pet photo → vertical bar-dance clip',
    taglineZh: '1 张宠物照片 → 竖屏吧台舞短片',
    seoTitleEn: 'Bby Wow — a pet bar-dance from one snapshot',
    seoTitleZh: 'Bby Wow — 一张宠物快照的吧台舞',
    seoDescEn:
      `One everyday pet snapshot becomes a ~${bbyTiming.creditCost}s vertical dance. Ordinary room, casual collar or plain fur.`,
    seoDescZh:
      `一张日常宠物快照，做成约 ${bbyTiming.creditCost} 秒的竖屏舞。普通房间，项圈或本来的毛色。`,
    heroEn: 'One pet snapshot. A vertical bar-dance.',
    heroZh: '一张宠物快照，一支竖屏吧台舞。',
    howEn: ['Upload 1 pet photo', 'Confirm it is your pet', 'Generate the clip'],
    howZh: ['上传 1 张宠物照片', '确认是你的宠物', '生成短片'],
    accent: 'magenta',
    logo: '/brand/templates/bby-wow.svg',
    poster: '/brand/templates/bby-wow-poster.svg',
    theme: { accent: 'magenta', heroPreset: 'split', typeVoice: 'playful', cardStyle: 'glow', coverStyle: 'orb', ambience: 'noise' },
    disclaimerEn: 'Pet photos only. Not affiliated with the original recording or any label.',
    disclaimerZh: '仅限宠物照片。与原曲或任何厂牌无关。',
    ...BBY_LIVE,
  },
  {
    slug: 'tiny-desk',
    displayName: 'Tiny Desk',
    displayNameZh: 'Tiny Desk',
    status: 'live',
    photoCount: 5,
    minPhotos: 1,
    photoSlots: livePhotoSlots('tiny-desk'),
    ...tinyTiming,
    taglineEn: 'Pet photos → a vertical desk concert',
    taglineZh: '宠物照片 → 竖屏桌边音乐会',
    seoTitleEn: 'Tiny Desk — a pet concert at a plain desk',
    seoTitleZh: 'Tiny Desk — 一张普通书桌上的宠物音乐会',
    seoDescEn:
      `A pet office-desk concert, vertical, about ${tinyTiming.creditCost}s. Lead singer, keys, two backups, optional sax. Everyday snapshots only.`,
    seoDescZh:
      `宠物桌边音乐会，竖屏，约 ${tinyTiming.creditCost} 秒。主唱、键盘、两侧和声，萨克斯可选。只要日常快照。`,
    heroEn: 'A desk, a microphone, and your pets.',
    heroZh: '一张书桌，一只麦克风，你家的宠物。',
    howEn: ['Upload the lead pet, then any bandmates', 'Confirm they are pets', 'Generate the concert'],
    howZh: ['先上传主唱，再上传乐队', '确认都是宠物', '生成音乐会'],
    accent: 'amber',
    logo: '/brand/templates/tiny-desk.svg',
    poster: '/brand/templates/tiny-desk-poster.svg',
    theme: { accent: 'amber', heroPreset: 'editorial', typeVoice: 'cool', cardStyle: 'mesh', coverStyle: 'grid', ambience: 'grid' },
    disclaimerEn: 'Pet photos only. Not an official desk concert, and not affiliated with the show it echoes.',
    disclaimerZh: '仅限宠物照片。不是官方桌边音乐会，也与它所借用的节目无关。',
    ...TINY_LIVE,
  },
  {
    slug: 'ceiling-fan',
    displayName: 'Ceiling Fan',
    displayNameZh: 'Ceiling Fan',
    status: 'live',
    photoCount: 1,
    minPhotos: 1,
    ...fanTiming,
    taglineEn: '1 pet photo → a fan-wipe outfit change',
    taglineZh: '1 张宠物照片 → 吊扇换装转场',
    seoTitleEn: 'Ceiling Fan — a pet outfit wipe from one snapshot',
    seoTitleZh: 'Ceiling Fan — 一张宠物快照的换装转场',
    seoDescEn:
      `One everyday pet snapshot becomes a ~${fanTiming.creditCost}s outfit wipe. The fan exists only in the clip. Never strap a phone to a real fan.`,
    seoDescZh:
      `一张日常宠物快照，做成约 ${fanTiming.creditCost} 秒的换装转场。风扇只存在于成片里。切勿把手机绑在真风扇上。`,
    heroEn: 'One pet snapshot. A fan-wipe into another sweater.',
    heroZh: '一张宠物快照，一次扇叶转场，换一件毛衣。',
    howEn: ['Upload 1 pet photo', 'Confirm it is your pet', 'Generate the wipe'],
    howZh: ['上传 1 张宠物照片', '确认是你的宠物', '生成转场'],
    accent: 'cyan',
    logo: '/brand/templates/ceiling-fan.svg',
    poster: '/brand/templates/ceiling-fan-poster.svg',
    theme: { accent: 'cyan', heroPreset: 'split', typeVoice: 'cool', cardStyle: 'mesh', coverStyle: 'radial', ambience: 'none' },
    disclaimerEn: 'Pet photos only. The fan is generated — never strap a phone to a spinning fan.',
    disclaimerZh: '仅限宠物照片。风扇是生成的 — 切勿把手机绑在旋转的风扇上。',
    ...FAN_LIVE,
  },
  {
    slug: 'bulin-47',
    displayName: 'Bulin 47',
    displayNameZh: 'Bulin 47',
    status: 'soon',
    photoCount: 1,
    durationEn: 'TBD',
    durationZh: '待定',
    taglineEn: 'A pet dance edit — coming soon',
    taglineZh: '宠物舞蹈剪辑 — 即将上线',
    seoTitleEn: 'Bulin 47 — Coming soon',
    seoTitleZh: 'Bulin 47 — 即将上线',
    seoDescEn: 'Bulin 47 AI template is coming soon. Not generatable yet.',
    seoDescZh: 'Bulin 47 AI 模板即将上线，暂不可生成。',
    heroEn: 'Bulin 47 is on the way.',
    heroZh: 'Bulin 47 即将上线。',
    howEn: ['Upload', 'Confirm', 'Generate'],
    howZh: ['上传', '确认', '生成'],
    accent: 'orange',
    logo: '/brand/templates/bulin-47.svg',
    theme: { accent: 'orange', heroPreset: 'centered', typeVoice: 'bold', cardStyle: 'soft', coverStyle: 'orb', ambience: 'none' },
    disclaimerEn: 'Coming soon · pet photos only.',
    disclaimerZh: '即将上线 · 仅限宠物照片。',
  },
  {
    slug: 'zombie-love',
    displayName: 'Zombie Love',
    displayNameZh: 'Zombie Love',
    status: 'soon',
    photoCount: 1,
    durationEn: 'TBD',
    durationZh: '待定',
    taglineEn: 'A pet in a costume — coming soon',
    taglineZh: '宠物装扮短片 — 即将上线',
    seoTitleEn: 'Zombie Love — Coming soon',
    seoTitleZh: 'Zombie Love — 即将上线',
    seoDescEn: 'Zombie Love AI template is coming soon. Not generatable yet.',
    seoDescZh: 'Zombie Love AI 模板即将上线，暂不可生成。',
    heroEn: 'A costumed pet is on the way.',
    heroZh: '一只装扮过的宠物即将上线。',
    howEn: ['Upload', 'Confirm', 'Generate'],
    howZh: ['上传', '确认', '生成'],
    accent: 'sky',
    logo: '/brand/templates/zombie-love.svg',
    theme: { accent: 'sky', heroPreset: 'split', typeVoice: 'cool', cardStyle: 'soft', coverStyle: 'grid', ambience: 'none' },
    disclaimerEn: 'Coming soon · pet photos only.',
    disclaimerZh: '即将上线 · 仅限宠物照片。',
  },
  {
    slug: 'smalltown-boy-cats',
    displayName: 'Smalltown Boy Cats',
    displayNameZh: 'Smalltown Boy Cats',
    status: 'soon',
    photoCount: 1,
    durationEn: 'TBD',
    durationZh: '待定',
    taglineEn: 'Pet-first music-video vibe — coming soon',
    taglineZh: '宠物向音乐短片风 — 即将上线',
    seoTitleEn: 'Smalltown Boy Cats — Coming soon',
    seoTitleZh: 'Smalltown Boy Cats — 即将上线',
    seoDescEn: 'Smalltown Boy Cats AI template is coming soon. Not generatable yet.',
    seoDescZh: 'Smalltown Boy Cats AI 模板即将上线，暂不可生成。',
    heroEn: 'Smalltown Boy Cats is on the way.',
    heroZh: 'Smalltown Boy Cats 即将上线。',
    howEn: ['Upload', 'Confirm', 'Generate'],
    howZh: ['上传', '确认', '生成'],
    accent: 'violet',
    logo: '/brand/templates/smalltown-boy-cats.svg',
    theme: { accent: 'violet', heroPreset: 'editorial', typeVoice: 'playful', cardStyle: 'soft', coverStyle: 'stripes', ambience: 'none' },
    disclaimerEn: 'Coming soon · pet photos with owner permission.',
    disclaimerZh: '即将上线 · 需宠物主人授权照片。',
  },
  {
    slug: 'clapping-cat',
    displayName: 'Clapping Cat',
    displayNameZh: 'Clapping Cat',
    status: 'soon',
    photoCount: 1,
    durationEn: 'TBD',
    durationZh: '待定',
    taglineEn: 'Clap-along cat meme — coming soon',
    taglineZh: '鼓掌猫 meme — 即将上线',
    seoTitleEn: 'Clapping Cat — Coming soon',
    seoTitleZh: 'Clapping Cat — 即将上线',
    seoDescEn: 'Clapping Cat AI template is coming soon. Not generatable yet.',
    seoDescZh: 'Clapping Cat AI 模板即将上线，暂不可生成。',
    heroEn: 'Clapping Cat is on the way.',
    heroZh: 'Clapping Cat 即将上线。',
    howEn: ['Upload', 'Confirm', 'Generate'],
    howZh: ['上传', '确认', '生成'],
    accent: 'rose',
    logo: '/brand/templates/clapping-cat.svg',
    theme: { accent: 'rose', heroPreset: 'centered', typeVoice: 'playful', cardStyle: 'glow', coverStyle: 'orb', ambience: 'none' },
    disclaimerEn: 'Coming soon · pet photos with owner permission.',
    disclaimerZh: '即将上线 · 需宠物主人授权照片。',
  },
  {
    slug: 'knight-cat',
    displayName: 'Knight Cat',
    displayNameZh: 'Knight Cat',
    status: 'soon',
    photoCount: 1,
    durationEn: 'TBD',
    durationZh: '待定',
    taglineEn: 'Knightly cat transform — coming soon',
    taglineZh: '骑士猫变身 — 即将上线',
    seoTitleEn: 'Knight Cat — Coming soon',
    seoTitleZh: 'Knight Cat — 即将上线',
    seoDescEn: 'Knight Cat AI template is coming soon. Not generatable yet.',
    seoDescZh: 'Knight Cat AI 模板即将上线，暂不可生成。',
    heroEn: 'Knight Cat is on the way.',
    heroZh: 'Knight Cat 即将上线。',
    howEn: ['Upload', 'Confirm', 'Generate'],
    howZh: ['上传', '确认', '生成'],
    accent: 'lime',
    logo: '/brand/templates/knight-cat.svg',
    theme: { accent: 'lime', heroPreset: 'split', typeVoice: 'bold', cardStyle: 'mesh', coverStyle: 'radial', ambience: 'none' },
    disclaimerEn: 'Coming soon · pet photos with owner permission.',
    disclaimerZh: '即将上线 · 需宠物主人授权照片。',
  },
  {
    slug: 'car-jump',
    displayName: 'Car Jump',
    displayNameZh: 'Car Jump',
    status: 'soon',
    photoCount: 1,
    durationEn: 'TBD',
    durationZh: '待定',
    taglineEn: 'A pet mid-jump — coming soon',
    taglineZh: '宠物跳跃短片 — 即将上线',
    seoTitleEn: 'Car Jump — Coming soon',
    seoTitleZh: 'Car Jump — 即将上线',
    seoDescEn: 'Car Jump AI template is coming soon. Not generatable yet.',
    seoDescZh: 'Car Jump AI 模板即将上线，暂不可生成。',
    heroEn: 'A pet mid-jump is on the way.',
    heroZh: '一只跳跃中的宠物即将上线。',
    howEn: ['Upload', 'Confirm', 'Generate'],
    howZh: ['上传', '确认', '生成'],
    accent: 'slate',
    logo: '/brand/templates/car-jump.svg',
    theme: { accent: 'slate', heroPreset: 'editorial', typeVoice: 'cool', cardStyle: 'ribbon', coverStyle: 'stripes', ambience: 'none' },
    disclaimerEn: 'Coming soon · pet photos only.',
    disclaimerZh: '即将上线 · 仅限宠物照片。',
  },
];

export const TEMPLATE_SLUGS = TEMPLATES.map((t) => t.slug);

export function getTemplate(slug: string): Template | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

export function requireTemplate(slug: string): Template {
  const t = getTemplate(slug);
  if (!t) throw new Error(`Unknown template slug: ${slug}`);
  return t;
}

export const LIVE_TEMPLATES = TEMPLATES.filter((t) => t.status === 'live');
export const SOON_TEMPLATES = TEMPLATES.filter((t) => t.status === 'soon');
