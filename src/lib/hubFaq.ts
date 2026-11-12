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
const tinyCredits = sourceCredits('tiny-desk');
const fanCredits = sourceCredits('ceiling-fan');

/** Hub-level questions. Brand pages keep their own keyword sets. */
export const HUB_FAQ: readonly FaqEntry[] = [
  {
    id: 'what',
    qEn: 'What is Swaystill?',
    qZh: 'Swaystill 是什么？',
    aEn:
      'Swaystill makes a short vertical clip from a pet photo you already have. Pick a look, upload the pet, and generate. Each look has its own page.',
    aZh: 'Swaystill 用你已经有的宠物照片做一条竖屏短片。选一个效果，上传宠物，然后生成。每个效果有自己的页面。',
  },
  {
    id: 'looks',
    qEn: 'Which looks can I open today?',
    qZh: '现在能做哪些效果？',
    aEn:
      'Three: Bby Wow (one pet, bar dance), Tiny Desk (a pet band at a desk), and Ceiling Fan (one pet, outfit wipe). Create on the home page lists those looks.',
    aZh:
      '三个：Bby Wow（一只宠物，吧台舞）、Tiny Desk（书桌边的宠物乐队）、Ceiling Fan（一只宠物，换装转场）。首页的创作里列出的就是这些。',
  },
  {
    id: 'bby',
    qEn: 'What is Bby Wow?',
    qZh: 'Bby Wow 是什么？',
    aEn:
      `One pet snapshot becomes a bar-dance clip of about ${bbyCredits} seconds. Questions for that look are on the Bby Wow page.`,
    aZh: `一张宠物快照做成大约 ${bbyCredits} 秒的吧台舞。这个效果自己的问题在 Bby Wow 页面上。`,
  },
  {
    id: 'tiny',
    qEn: 'What is Tiny Desk?',
    qZh: 'Tiny Desk 是什么？',
    aEn:
      `Pet snapshots become a desk concert of about ${tinyCredits} seconds. The lead is required. Keys, backups, and sax are optional.`,
    aZh: `宠物快照做成大约 ${tinyCredits} 秒的桌边音乐会。主唱必填。键盘、和声和萨克斯可选。`,
  },
  {
    id: 'fan',
    qEn: 'What is Ceiling Fan?',
    qZh: 'Ceiling Fan 是什么？',
    aEn:
      `One pet snapshot becomes an outfit wipe of about ${fanCredits} seconds. The fan is generated. Never strap a phone to a real fan.`,
    aZh: `一张宠物快照做成大约 ${fanCredits} 秒的换装转场。风扇是生成的。切勿把手机绑在真风扇上。`,
  },
  {
    id: 'photos',
    qEn: 'What photos can I upload?',
    qZh: '可以上传什么照片？',
    aEn:
      'Everyday pet snapshots, in an ordinary room. One pet, or a small band, depending on the look. You need the right to use the photo. Do not upload people.',
    aZh: '普通房间里的宠物日常快照。按效果需要一只，或一支小乐队。你需要有使用这张照片的权利。请勿上传人。',
  },
  {
    id: 'consent',
    qEn: 'What do I confirm?',
    qZh: '需要确认什么？',
    aEn:
      'That the upload is a pet you can use, not a person. Ceiling Fan is generated — never strap a phone to a fan.',
    aZh: '上传的是你可以使用的宠物，不是人。吊扇效果是生成的 — 切勿把手机绑在风扇上。',
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
      `About ${bbyCredits} seconds for Bby Wow, ${tinyCredits} seconds for Tiny Desk, and about ${fanCredits} seconds for Ceiling Fan. The file shows on your account when the job is ready.`,
    aZh: `Bby Wow 大约 ${bbyCredits} 秒，Tiny Desk 大约 ${tinyCredits} 秒，Ceiling Fan 大约 ${fanCredits} 秒。任务完成后，成片会出现在你的账户里。`,
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
    qEn: 'Can I upload a person?',
    qZh: '可以上传人吗？',
    aEn: 'No. Swaystill is a pet remake. Do not upload people.',
    aZh: '不可以。Swaystill 是宠物翻拍。请勿上传人。',
  },
  {
    id: 'affiliation',
    qEn: 'Are these official shows or songs?',
    qZh: '这些是官方节目或歌曲吗？',
    aEn: 'No. Independent pet remakes. Not an official recording, label, or desk concert.',
    aZh: '不是。独立的宠物翻拍。不是官方录音、厂牌或桌边音乐会。',
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
