/** Template catalog. logo = public path to brand mark. Ops routing uses slug — never in customer copy. */

export type TemplateStatus = 'live' | 'soon';

export type Template = {
  slug: string;
  displayName: string;
  displayNameZh: string;
  status: TemplateStatus;
  photoCount: 1 | 2;
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
  accent: 'magenta' | 'amber' | 'cyan' | 'violet' | 'rose' | 'lime' | 'orange' | 'sky' | 'slate';
  /** Public path to brand mark (svg/png). */
  logo: string;
  disclaimerEn: string;
  disclaimerZh: string;
};

export const TEMPLATES: readonly Template[] = [
  {
    slug: 'bby-wow',
    displayName: 'Bby Wow AI',
    displayNameZh: 'Bby Wow AI',
    status: 'live',
    photoCount: 1,
    durationEn: '~10s',
    durationZh: '约 10 秒',
    taglineEn: '1 photo → vertical party-dance clip',
    taglineZh: '1 张照片 → 竖屏派对舞短片',
    seoTitleEn: 'Bby Wow AI — 1 photo party dance video',
    seoTitleZh: 'Bby Wow AI — 1 张照片派对舞短片',
    seoDescEn:
      'Turn one adult-consent photo into a ~10s vertical party-dance AI video. Generate and pay are stubs until fal / Waffo are wired.',
    seoDescZh:
      '用 1 张成人同意照片生成约 10 秒竖屏派对舞 AI 短片。生成与支付为占位，待接入 fal / Waffo。',
    heroEn: 'Upload one photo. Get a vertical party-dance remix.',
    heroZh: '上传一张照片，生成竖屏派对舞 remix。',
    howEn: ['Upload 1 adult-consent photo', 'Confirm consent & credits stub', 'Generate (stub until fal is wired)'],
    howZh: ['上传 1 张成人同意照片', '确认授权与积分占位', '生成（待接入 fal）'],
    accent: 'magenta',
    logo: '/brand/templates/bby-wow.svg',
    disclaimerEn: 'Adult consent only · no minors. Not affiliated with Karol G, CapCut, or any label.',
    disclaimerZh: '仅限成人同意照片 · 禁止未成年人。非 Karol G / CapCut 官方。',
  },
  {
    slug: 'kiss-cam',
    displayName: 'Coldplay Kiss Cam AI',
    displayNameZh: 'Coldplay Kiss Cam AI',
    status: 'live',
    photoCount: 2,
    durationEn: '~11–12s',
    durationZh: '约 11–12 秒',
    taglineEn: '2 photos → stadium kiss-cam remix (no concert footage)',
    taglineZh: '2 张照片 → 球场大屏风（无演唱会素材）',
    seoTitleEn: 'Coldplay Kiss Cam AI — 2 photos stadium remix',
    seoTitleZh: 'Coldplay Kiss Cam AI — 2 张照片球场大屏',
    seoDescEn:
      'Two adult-consent photos → stadium kiss-cam style AI clip. No real concert footage. Generate/pay stubbed.',
    seoDescZh:
      '两张成人同意照片 → 球场大屏风 AI 短片。无真实演唱会素材。生成/支付为占位。',
    heroEn: 'Two photos. One stadium jumbotron moment — AI only.',
    heroZh: '两张照片，一秒球场大屏 —— 纯 AI。',
    howEn: ['Upload 2 adult-consent photos', 'Confirm consent (no concert footage)', 'Generate (stub until fal is wired)'],
    howZh: ['上传 2 张成人同意照片', '确认授权（无演唱会素材）', '生成（待接入 fal）'],
    accent: 'amber',
    logo: '/brand/templates/kiss-cam.svg',
    disclaimerEn:
      'Adult consent only · no minors. Fan-made AI remix — not official Coldplay / CapCut. No real concert footage.',
    disclaimerZh: '仅限成人同意 · 禁止未成年人。粉丝向 AI remix · 非 Coldplay / CapCut 官方。不含真实演唱会素材。',
  },
  {
    slug: 'ceiling-fan',
    displayName: 'Ceiling Fan Transition AI',
    displayNameZh: 'Ceiling Fan Transition AI',
    status: 'live',
    photoCount: 1,
    durationEn: '~12–15s',
    durationZh: '约 12–15 秒',
    taglineEn: '1 photo → fan-wipe outfit change (AI only — no real fan)',
    taglineZh: '1 张照片 → 吊扇换装转场（纯 AI · 勿绑真风扇）',
    seoTitleEn: 'Ceiling Fan Transition AI — 1 photo outfit change',
    seoTitleZh: 'Ceiling Fan Transition AI — 1 张照片换装转场',
    seoDescEn:
      'One adult-consent photo → ~12–15s AI ceiling-fan outfit change. Never strap a phone to a fan. Generate/pay stubbed.',
    seoDescZh:
      '1 张成人同意照片 → 约 12–15 秒吊扇换装转场。切勿把手机绑在风扇上。生成/支付为占位。',
    heroEn: 'One photo. An AI fan-wipe outfit change — never a real fan.',
    heroZh: '一张照片，AI 吊扇换装 —— 切勿使用真风扇。',
    howEn: ['Upload 1 adult-consent photo', 'Confirm consent & safety note', 'Generate (stub until fal is wired)'],
    howZh: ['上传 1 张成人同意照片', '确认授权与安全提示', '生成（待接入 fal）'],
    accent: 'cyan',
    logo: '/brand/templates/ceiling-fan.svg',
    disclaimerEn:
      'Adult consent only · no minors. Pure AI — never strap a phone to a spinning fan. Not affiliated with CapCut.',
    disclaimerZh: '仅限成人同意 · 禁止未成年人。纯 AI · 切勿把手机绑在旋转风扇上。非 CapCut 官方。',
  },
  {
    slug: 'bulin-47',
    displayName: 'Bulin 47',
    displayNameZh: 'Bulin 47',
    status: 'soon',
    photoCount: 1,
    durationEn: 'TBD',
    durationZh: '待定',
    taglineEn: 'Trend edit template — coming soon',
    taglineZh: '潮流剪辑模板 — 即将上线',
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
    disclaimerEn: 'Coming soon · adult consent will be required.',
    disclaimerZh: '即将上线 · 上线后需成人同意照片。',
  },
  {
    slug: 'zombie-love',
    displayName: 'Zombie Love',
    displayNameZh: 'Zombie Love',
    status: 'soon',
    photoCount: 1,
    durationEn: 'TBD',
    durationZh: '待定',
    taglineEn: 'Zombie romance remix — coming soon',
    taglineZh: '丧尸恋爱混剪 — 即将上线',
    seoTitleEn: 'Zombie Love — Coming soon',
    seoTitleZh: 'Zombie Love — 即将上线',
    seoDescEn: 'Zombie Love AI template is coming soon. Not generatable yet.',
    seoDescZh: 'Zombie Love AI 模板即将上线，暂不可生成。',
    heroEn: 'Zombie Love is on the way.',
    heroZh: 'Zombie Love 即将上线。',
    howEn: ['Upload', 'Confirm', 'Generate'],
    howZh: ['上传', '确认', '生成'],
    accent: 'sky',
    logo: '/brand/templates/zombie-love.svg',
    disclaimerEn: 'Coming soon · adult consent will be required.',
    disclaimerZh: '即将上线 · 上线后需成人同意照片。',
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
    taglineEn: 'Car-jump action clip — coming soon',
    taglineZh: '飙车跳跃动作短片 — 即将上线',
    seoTitleEn: 'Car Jump — Coming soon',
    seoTitleZh: 'Car Jump — 即将上线',
    seoDescEn: 'Car Jump AI template is coming soon. Not generatable yet.',
    seoDescZh: 'Car Jump AI 模板即将上线，暂不可生成。',
    heroEn: 'Car Jump is on the way.',
    heroZh: 'Car Jump 即将上线。',
    howEn: ['Upload', 'Confirm', 'Generate'],
    howZh: ['上传', '确认', '生成'],
    accent: 'slate',
    logo: '/brand/templates/car-jump.svg',
    disclaimerEn: 'Coming soon · adult consent will be required.',
    disclaimerZh: '即将上线 · 上线后需成人同意照片。',
  },
] as const;

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
