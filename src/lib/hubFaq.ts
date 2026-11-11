import { SITE, packPriceList } from './site';
import type { FaqEntry } from './templates';
import { getTemplate as sourceTemplate } from '../../functions/_lib/templates.js';

const packsEn = packPriceList('en');
const packsZh = packPriceList('zh');

function sourceCredits(slug: string): number {
  const row = sourceTemplate(slug);
  const credits = row && row.creditCost;
  if (!credits) throw new Error(`Missing source duration for ${slug}`);
  return credits;
}

const bbyCredits = sourceCredits('bby-wow');
const kissCredits = sourceCredits('kiss-cam');
const fanCredits = sourceCredits('ceiling-fan');

/** Hub-level questions. Brand pages keep their own keyword sets. */
export const HUB_FAQ: readonly FaqEntry[] = [
  {
    id: 'what',
    qEn: 'What is Swaystill?',
    qZh: 'Swaystill 是什么？',
    aEn:
      'Swaystill makes a short vertical clip from a photo you already have. Pick a look, upload an adult-consent photo (two for the kiss-cam look), and generate. Each look has its own page.',
    aZh: 'Swaystill 用你已经有的照片做一条竖屏短片。选一个效果，上传成人同意的照片（kiss cam 要两张），然后生成。每个效果有自己的页面。',
  },
  {
    id: 'looks',
    qEn: 'Which looks can I open today?',
    qZh: '现在能做哪些效果？',
    aEn:
      'Three: Bby Wow AI (one photo, party dance), Coldplay Kiss Cam AI (two photos, stadium board), and Ceiling Fan Transition AI (one photo, outfit-change wipe). Create on the home page lists those looks.',
    aZh:
      '三个：Bby Wow AI（一张照片，派对舞）、Coldplay Kiss Cam AI（两张照片，球场大屏）、Ceiling Fan Transition AI（一张照片，换装转场）。首页的创作里列出的就是这些。',
  },
  {
    id: 'bby',
    qEn: 'What is Bby Wow AI?',
    qZh: 'Bby Wow AI 是什么？',
    aEn:
      `One adult photo becomes a party-dance clip of about ${bbyCredits} seconds. The sample photo, the clip, and questions for that look are on the Bby Wow page.`,
    aZh: `一张成人照片做成大约 ${bbyCredits} 秒的派对舞。示例照片、短片和这个效果自己的问题，在 Bby Wow 页面上。`,
  },
  {
    id: 'kiss',
    qEn: 'What is Coldplay Kiss Cam AI?',
    qZh: 'Coldplay Kiss Cam AI 是什么？',
    aEn:
      `Two adult photos become a jumbotron-style clip of about ${kissCredits} seconds. It uses no concert footage and is not official Coldplay.`,
    aZh: `两张成人照片做成大约 ${kissCredits} 秒的大屏风格短片。不含演唱会素材，也不是 Coldplay 官方。`,
  },
  {
    id: 'fan',
    qEn: 'What is Ceiling Fan Transition AI?',
    qZh: 'Ceiling Fan Transition AI 是什么？',
    aEn:
      `One adult photo becomes an outfit-change wipe of about ${fanCredits} seconds. The fan is generated. Never strap a phone to a real fan.`,
    aZh: `一张成人照片做成大约 ${fanCredits} 秒的换装转场。风扇是生成的。切勿把手机绑在真风扇上。`,
  },
  {
    id: 'photos',
    qEn: 'What photos can I upload?',
    qZh: '可以上传什么照片？',
    aEn:
      'Clear photos of consenting adults, in ordinary light. One or two, depending on the look. You need the rights to the photo. Do not upload photos of minors.',
    aZh: '光线普通、同意出镜的成人，脸要清楚。按效果需要一张或两张。你需要有使用这张照片的权利。请勿上传未成年人照片。',
  },
  {
    id: 'consent',
    qEn: 'Do I need consent?',
    qZh: '需要授权吗？',
    aEn:
      'Yes. Only adults who agree to appear. Kiss Cam uses no real concert footage. Ceiling Fan is generated — never strap a phone to a fan.',
    aZh: '需要。仅限同意出镜的成人。Kiss Cam 不含真实演唱会素材。吊扇效果是生成的 — 切勿把手机绑在风扇上。',
  },
  {
    id: 'generate',
    qEn: 'Does generate return a finished video?',
    qZh: '生成会给出成片吗？',
    aEn:
      'Signed-in Generate queues a job and uses the credits for that look. The clip shows on your account when it is ready. If it does not finish, those credits return. There is no fake success clip.',
    aZh: '登录后生成会排队，并扣这个效果所需的积分。完成后，成片会出现在你的账户里。没完成则积分退回。不会伪造成功视频。',
  },
  {
    id: 'length',
    qEn: 'How long does a clip run?',
    qZh: '短片有多长？',
    aEn:
      `About ${bbyCredits} seconds for Bby Wow, ${kissCredits} seconds for Kiss Cam, and about ${fanCredits} seconds for Ceiling Fan. Those are the lengths of the source clips. The file shows on your account when the job is ready.`,
    aZh: `Bby Wow 大约 ${bbyCredits} 秒，Kiss Cam 大约 ${kissCredits} 秒，Ceiling Fan 大约 ${fanCredits} 秒。这是素材的时长。任务完成后，成片会出现在你的账户里。`,
  },
  {
    id: 'credits',
    qEn: 'How do credits work?',
    qZh: '积分怎么计算？',
    aEn: `One credit is one second of that look’s source clip, rounded to the nearest second. Packs are ${packsEn}. A new account starts at 0 credits.`,
    aZh: `1 积分是该效果素材的 1 秒，按秒四舍五入。套餐为 ${packsZh}。新账户从 0 积分开始。`,
  },
  {
    id: 'free',
    qEn: 'Is Swaystill free?',
    qZh: 'Swaystill 免费吗？',
    aEn: `No. A clip uses credits. Packs are ${packsEn}. Buying a pack charges a card.`,
    aZh: `不免费。一条短片要消耗积分。套餐为 ${packsZh}。购买套餐会扣银行卡。`,
  },
  {
    id: 'kids',
    qEn: 'Can I make a clip of a child?',
    qZh: '可以做孩子的短片吗？',
    aEn: 'No. Adult consent only. Do not upload photos of minors.',
    aZh: '不可以。仅限成人同意。请勿上传未成年人照片。',
  },
  {
    id: 'affiliation',
    qEn: 'Are you CapCut, Coldplay, or Karol G?',
    qZh: '你们是 CapCut、Coldplay 或 Karol G 吗？',
    aEn: 'No. Independent remix looks — not official CapCut, Coldplay, Karol G, or any label.',
    aZh: '不是。独立的 remix 效果 — 非 CapCut、Coldplay、Karol G 或任何厂牌官方。',
  },
  {
    id: 'refund',
    qEn: 'What if generate fails? Is there a refund?',
    qZh: '生成失败会退款吗？',
    aEn:
      'The credits for that job return to your account. No clip is saved. A card is charged only after a completed pack purchase.',
    aZh: '这次任务的积分会退回账户。不会留下成片。只有积分包付款完成后才会扣银行卡。',
  },
  {
    id: 'retention',
    qEn: 'How long do you keep photos?',
    qZh: '照片保留多久？',
    aEn: `Photos are kept about ${SITE.photoRetentionDays} days after upload. Finished clips are kept about ${SITE.videoRetentionDays} days. Details are on the Privacy page.`,
    aZh: `照片上传后大约保留 ${SITE.photoRetentionDays} 天。成片大约保留 ${SITE.videoRetentionDays} 天。细节见隐私政策。`,
  },
  {
    id: 'unlisted',
    qEn: 'What if my look is not listed?',
    qZh: '我想要的效果不在列表里怎么办？',
    aEn: 'Create offers the looks shown on the home page. If a look is not there, it is not offered.',
    aZh: '创作里提供的是首页上的那些效果。不在首页上的，就还没有提供。',
  },
];

const COMPACT_IDS = ['what', 'looks', 'photos', 'generate', 'affiliation', 'free'] as const;

export const HUB_FAQ_COMPACT: readonly FaqEntry[] = COMPACT_IDS.map(
  (id) => HUB_FAQ.find((item) => item.id === id)!,
);
