import { SITE } from './site';
import type { FaqEntry } from './templates';

const { oneShotUsd, kissCamOneShotUsd, packs, creditPerGenerate } = SITE.pricing;
const packLine = packs.map((p) => p.credits).join(' / ');

/** Hub-level questions. Brand pages keep their own keyword sets. */
export const HUB_FAQ: readonly FaqEntry[] = [
  {
    id: 'what',
    qEn: 'What is Viral Templates?',
    qZh: 'Viral Templates 是什么？',
    aEn:
      'Viral Templates makes short vertical clips from photos you already have. Pick a look, upload an adult-consent photo (two for the kiss-cam look), and generate. Each look has its own page.',
    aZh: 'Viral Templates 用你已经有的照片做竖屏短片。选一个效果，上传成人同意的照片（kiss cam 要两张），然后生成。每个效果有自己的页面。',
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
      'One adult photo becomes a party-dance clip of about 10 seconds. The sample photo, the clip, and questions for that look are on the Bby Wow page.',
    aZh: '一张成人照片做成大约 10 秒的派对舞。示例照片、短片和这个效果自己的问题，在 Bby Wow 页面上。',
  },
  {
    id: 'kiss',
    qEn: 'What is Coldplay Kiss Cam AI?',
    qZh: 'Coldplay Kiss Cam AI 是什么？',
    aEn:
      'Two adult photos become a jumbotron-style clip of about 11–12 seconds. It uses no concert footage and is not official Coldplay.',
    aZh: '两张成人照片做成大约 11–12 秒的大屏风格短片。不含演唱会素材，也不是 Coldplay 官方。',
  },
  {
    id: 'fan',
    qEn: 'What is Ceiling Fan Transition AI?',
    qZh: 'Ceiling Fan Transition AI 是什么？',
    aEn:
      'One adult photo becomes an outfit-change wipe of about 12–15 seconds. The fan is generated. Never strap a phone to a real fan.',
    aZh: '一张成人照片做成大约 12–15 秒的换装转场。风扇是生成的。切勿把手机绑在真风扇上。',
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
    qEn: 'Does generate return a finished video yet?',
    qZh: '生成现在会给出成片吗？',
    aEn:
      'Signed-in Generate queues a job on your account and uses one credit. It does not produce a finished video yet. Buying credits is not open. There is no fake success clip.',
    aZh: '登录后生成会把任务排进你的账户并扣 1 积分。目前不会产出成片。购买积分尚未开通。不会伪造成功视频。',
  },
  {
    id: 'length',
    qEn: 'How long does a clip run?',
    qZh: '短片有多长？',
    aEn:
      'About 10 seconds for Bby Wow, 11–12 seconds for Kiss Cam, and 12–15 seconds for Ceiling Fan. Those are the lengths of the looks. A file is not ready to download on this demo.',
    aZh: 'Bby Wow 大约 10 秒，Kiss Cam 大约 11–12 秒，Ceiling Fan 大约 12–15 秒。这是效果的时长。这个演示里还不能下载成片。',
  },
  {
    id: 'credits',
    qEn: 'How do credits work?',
    qZh: '积分怎么计算？',
    aEn: `Each generate uses ${creditPerGenerate} credit. Demo prices start at $${oneShotUsd} for a one-photo clip and $${kissCamOneShotUsd} for the two-photo kiss-cam look, with packs of ${packLine} credits. Checkout is not open.`,
    aZh: `每次生成扣 ${creditPerGenerate} 积分。演示价格：一张照片的短片 $${oneShotUsd} 起，两张照片的 kiss cam $${kissCamOneShotUsd}，积分包为 ${packLine}。结账尚未开放。`,
  },
  {
    id: 'free',
    qEn: 'Is Viral Templates free?',
    qZh: 'Viral Templates 免费吗？',
    aEn:
      'No. Prices on the Pricing page are demo figures. Checkout is not open, so you cannot pay here yet. Generate is not a free finished download.',
    aZh: '不免费。价格页上是演示数字。结账尚未开放，所以这里还不能付款。生成也不是一次免费的成片下载。',
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
      'Checkout is not open on this demo, so no card is charged. A generate that fails to produce a clip is not a finished purchase. Today the job is queued and a credit is used, and no video file is returned. When payments exist, refund rules will be on the Terms page.',
    aZh:
      '这个演示未开放结账，所以不会扣银行卡。没有成片的生成，不是一次完成的购买。目前任务会排队并扣 1 积分，没有视频文件。支付上线后，退款规则写在服务条款里。',
  },
  {
    id: 'retention',
    qEn: 'How long do you keep photos?',
    qZh: '照片保留多久？',
    aEn: `About ${SITE.photoRetentionDays} days after upload. Details are on the Privacy page.`,
    aZh: `上传后大约 ${SITE.photoRetentionDays} 天。细节见隐私政策。`,
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
