import { packPriceList } from './site';
import type { LivePack } from './templates';
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

const photo = '/brand/templates';

export const BBY_LIVE: LivePack = {
  cases: [
    {
      id: 'kitchen-floor',
      labelEn: 'Kitchen-floor snapshot',
      labelZh: '厨房地板快照',
      sources: [`${photo}/bby-wow-poster.svg`],
      resultPoster: `${photo}/bby-wow-poster.svg`,
      noteEn: 'A placeholder still. The finished pet clip is added after this release.',
      noteZh: '这是占位静帧。宠物成片会在这次发布之后补上。',
    },
  ],
  story: {
    layout: 'party',
    lead: {
      eyebrowEn: 'A snapshot is enough',
      eyebrowZh: '一张快照就够',
      titleEn: 'The dance stays. The dancer is your pet.',
      titleZh: '舞还是那支舞。跳舞的是你的宠物。',
      bodyEn:
        'Bby Wow is the same vertical bar-dance, held from one photo you already have. The photo should look like a phone picture: a pet on a kitchen floor, by a plain wall, in ordinary daylight. The clip keeps the dance, the cuts, and the timing.',
      bodyZh:
        'Bby Wow 还是那支竖屏吧台舞，从你已经有的一张照片开始。照片最好像手机拍的：宠物在厨房地板上，或靠着一面白墙，日光很普通。成片保留舞、切点和时长。',
    },
    support: {
      eyebrowEn: 'One pet',
      eyebrowZh: '一只宠物',
      titleEn: 'One animal. The whole dance.',
      titleZh: '一只动物，整支舞。',
      bodyEn:
        'Upload one clear snapshot of one pet. A collar or plain fur is enough. The clip does not invent a second animal, and it does not put a person in the room.',
      bodyZh: '上传一张清楚的宠物快照。项圈或本来的毛色就够。成片不会多造一只动物，也不会把人放进房间。',
    },
    beats: [
      {
        titleEn: 'The reply',
        titleZh: '回那条消息',
        bodyEn: 'Send the dance when the chat only has a still of your pet.',
        bodyZh: '聊天里只有宠物的一张静帧时，回这支舞。',
      },
      {
        titleEn: 'The room you already have',
        titleZh: '你已经有的房间',
        bodyEn: 'No club, no costume rack. The floor in the photo is the floor in the clip.',
        bodyZh: '没有夜店，也没有服装架。照片里的地板就是成片里的地板。',
      },
      {
        titleEn: 'Just them',
        titleZh: '只有它',
        bodyEn: 'One pet. No partner and no second camera.',
        bodyZh: '一只宠物。不需要搭档，也不需要第二台机位。',
      },
    ],
    diy: {
      eyebrowEn: 'Compared with filming it',
      eyebrowZh: '和自己拍相比',
      titleEn: 'Skip the reshoot.',
      titleZh: '不必再拍一遍。',
      hardTitleEn: 'Film the dance',
      hardTitleZh: '现场再拍',
      hardEn: 'A song you can use, a pet that will stay, and someone to hold the phone.',
      hardZh: '一首你能用的歌，一只肯待着的宠物，以及一个举手机的人。',
      easyTitleEn: 'Start from the snapshot',
      easyTitleZh: '从快照开始',
      easyEn: 'Upload the pet photo you already have. Confirm it is a pet you can use. Generate saves the job on your account.',
      easyZh: '上传已经有的宠物照片。确认这是你可以使用的宠物。生成会把任务记在你的账户里。',
    },
  },
  faq: [
    {
      id: 'what',
      qEn: 'What is Bby Wow?',
      qZh: 'Bby Wow 是什么？',
      aEn: `Bby Wow turns one pet snapshot into a vertical bar-dance of about ${bbyCredits} seconds.`,
      aZh: `Bby Wow 用一张宠物快照，做成大约 ${bbyCredits} 秒的竖屏吧台舞。`,
    },
    {
      id: 'photo',
      qEn: 'What photo works?',
      qZh: '什么样的照片合适？',
      aEn: 'One pet, ordinary room, phone light, looking roughly toward the camera. Not a studio portrait and not a person.',
      aZh: '一只宠物，普通房间，手机光线，大致看向镜头。不是棚拍，也不是人。',
    },
    {
      id: 'why-one',
      qEn: 'Why only one photo?',
      qZh: '为什么只要一张？',
      aEn: 'The dance is built around a single pet. A second photo is a different look.',
      aZh: '这支舞围绕一只宠物。第二张照片是另一个效果。',
    },
    {
      id: 'length',
      qEn: 'How long is the video?',
      qZh: '视频有多长？',
      aEn: `About ${bbyCredits} seconds, vertical. This look uses ${bbyCredits} credits. The clip shows on your account when it is ready.`,
      aZh: `大约 ${bbyCredits} 秒，竖屏。这个效果扣 ${bbyCredits} 积分。完成后成片会出现在账户里。`,
    },
    {
      id: 'credits',
      qEn: 'How are credits calculated?',
      qZh: '积分怎么计算？',
      aEn: `This look uses ${bbyCredits} credits, one per second of its source clip. Packs are ${packsEn}. A failed clip returns the ${bbyCredits} credits.`,
      aZh: `这个效果扣 ${bbyCredits} 积分，按素材每秒 1 积分。套餐为 ${packsZh}。短片失败会退回这 ${bbyCredits} 积分。`,
    },
    {
      id: 'free',
      qEn: 'Is Bby Wow free?',
      qZh: 'Bby Wow 免费吗？',
      aEn: `No. This look uses ${bbyCredits} credits. Packs are ${packsEn}.`,
      aZh: `不免费。这个效果扣 ${bbyCredits} 积分。套餐为 ${packsZh}。`,
    },
    {
      id: 'pets',
      qEn: 'Can I upload a person?',
      qZh: '可以上传人吗？',
      aEn: 'No. This look is a pet remake. Upload a pet you have the right to use.',
      aZh: '不可以。这是宠物翻拍。请上传你有权使用的宠物。',
    },
    {
      id: 'affiliation',
      qEn: 'Are you affiliated with the original song?',
      qZh: '你们和原曲有关系吗？',
      aEn: 'No. Not affiliated with the recording, the artist, or any label.',
      aZh: '没有。与录音、艺人或任何厂牌无关。',
    },
    {
      id: 'refund',
      qEn: 'What if generate fails?',
      qZh: '生成失败会怎样？',
      aEn: `The ${bbyCredits} credits return to your account. A card is charged only after a pack purchase completes.`,
      aZh: `这 ${bbyCredits} 积分会退回账户。只有积分包付款完成后才会扣银行卡。`,
    },
  ],
};

export const TINY_LIVE: LivePack = {
  cases: [
    {
      id: 'desk-snapshot',
      labelEn: 'Desk snapshot',
      labelZh: '书桌快照',
      sources: [`${photo}/tiny-desk-poster.svg`],
      resultPoster: `${photo}/tiny-desk-poster.svg`,
      noteEn: 'Placeholder still. A pet demo clip can be attached after this release.',
      noteZh: '占位静帧。宠物示例成片可以在这次发布之后接上。',
    },
  ],
  story: {
    layout: 'desk',
    lead: {
      eyebrowEn: 'Desk concert',
      eyebrowZh: '桌边音乐会',
      titleEn: 'A small band, at a plain desk.',
      titleZh: '一支小乐队，在一张普通书桌上。',
      bodyEn:
        `Tiny Desk is a vertical concert of about ${tinyCredits} seconds. The lead pet sings close to the lens. Keys, left, right, and an optional sax can join from their own snapshots. The room stays ordinary: a wooden desk, a small microphone, phone light.`,
      bodyZh:
        `Tiny Desk 是大约 ${tinyCredits} 秒的竖屏音乐会。主唱宠物靠近镜头。键盘、左侧、右侧，以及可选的萨克斯，可以用各自的快照加入。房间保持普通：木书桌、小麦克风、手机光线。`,
    },
    support: {
      eyebrowEn: 'Who sits where',
      eyebrowZh: '谁坐在哪',
      titleEn: 'Lead is required. The rest of the band is optional.',
      titleZh: '主唱必填。乐队其他人选填。',
      bodyEn:
        'One photo is the lead, and the song collapses to that single pet. Several pets in one photo stay together in a single shot. Separate photos become hard cuts, and any seat you leave empty is not filled with an invented animal.',
      bodyZh:
        '一张照片就是主唱，歌会收成这一只宠物。同一张照片里的几只宠物会待在一个连续镜头里。分开的照片变成硬切。空着的座位不会被凭空补上一只动物。',
    },
    beats: [
      {
        titleEn: 'Lead',
        titleZh: '主唱',
        bodyEn: 'Close-up at the microphone for the opening phrase.',
        bodyZh: '开场是麦克风前的近景。',
      },
      {
        titleEn: 'Keys',
        titleZh: '键盘',
        bodyEn: 'A cut to paws on a small keyboard, still at the same desk.',
        bodyZh: '切到同一张书桌上、放在小键盘上的爪子。',
      },
      {
        titleEn: 'Backups and sax',
        titleZh: '和声与萨克斯',
        bodyEn: 'Left, right, then an optional sax. Skip any of them.',
        bodyZh: '左、右，然后是可选的萨克斯。都可以不传。',
      },
    ],
    diy: {
      eyebrowEn: 'Compared with a session',
      eyebrowZh: '和真的排练相比',
      titleEn: 'No stage, no call time.',
      titleZh: '没有舞台，也不用集合。',
      hardTitleEn: 'Book the room',
      hardTitleZh: '订一间房',
      hardEn: 'A desk, a microphone, pets that will sit, and a camera that can hold still.',
      hardZh: '一张书桌、一只麦克风、肯坐下的宠物，以及一台拿得稳的相机。',
      easyTitleEn: 'Start from snapshots',
      easyTitleZh: '从快照开始',
      easyEn: 'Upload the lead. Add bandmates if you have them. Confirm they are pets. Generate keeps one charge for the whole concert.',
      easyZh: '上传主唱。有乐队再补上。确认都是宠物。整场音乐会只扣一次。',
    },
  },
  faq: [
    {
      id: 'what',
      qEn: 'What is Tiny Desk?',
      qZh: 'Tiny Desk 是什么？',
      aEn: `A pet desk concert, vertical, about ${tinyCredits} seconds. It is not an official show.`,
      aZh: `一场宠物桌边音乐会，竖屏，大约 ${tinyCredits} 秒。不是官方节目。`,
    },
    {
      id: 'roles',
      qEn: 'Which photos do I need?',
      qZh: '要传哪些照片？',
      aEn: 'The lead singer is required. Keys, left backup, right backup, and sax are optional. Empty seats are dropped.',
      aZh: '主唱必填。键盘、左侧和声、右侧和声、萨克斯可选。空位会被丢掉。',
    },
    {
      id: 'together',
      qEn: 'What if they are in one photo?',
      qZh: '如果它们在同一张照片里？',
      aEn: 'Mark that they share the photo. The concert stays one continuous shot and they stay together.',
      aZh: '标明它们在同一张照片里。音乐会保持一个连续镜头，它们待在一起。',
    },
    {
      id: 'one',
      qEn: 'What if I only have one pet?',
      qZh: '如果只有一只宠物？',
      aEn: 'Upload that one photo. The song is performed by that pet alone. Missing bandmates are not invented.',
      aZh: '只上传那一张。整首歌由这一只来演。缺少的乐手不会被凭空补上。',
    },
    {
      id: 'length',
      qEn: 'How long is it?',
      qZh: '有多长？',
      aEn: `About ${tinyCredits} seconds. This look uses ${tinyCredits} credits, charged once.`,
      aZh: `大约 ${tinyCredits} 秒。这个效果扣 ${tinyCredits} 积分，只扣一次。`,
    },
    {
      id: 'credits',
      qEn: 'How are credits calculated?',
      qZh: '积分怎么计算？',
      aEn: `One credit per second of the source, rounded. This look is ${tinyCredits} credits. Packs are ${packsEn}.`,
      aZh: `按素材每秒 1 积分，四舍五入。这个效果是 ${tinyCredits} 积分。套餐为 ${packsZh}。`,
    },
    {
      id: 'pets',
      qEn: 'Can I upload a person?',
      qZh: '可以上传人吗？',
      aEn: 'No. Every seat is a pet. Upload snapshots you have the right to use.',
      aZh: '不可以。每个座位都是宠物。请上传你有权使用的快照。',
    },
    {
      id: 'affiliation',
      qEn: 'Is this the official desk concert?',
      qZh: '这是官方桌边音乐会吗？',
      aEn: 'No. It is an independent pet remake of the format. It is not the show, and it does not use that concert’s footage.',
      aZh: '不是。这是这个形式的独立宠物翻拍。不是那个节目，也不使用那场演出的素材。',
    },
    {
      id: 'refund',
      qEn: 'What if generate fails?',
      qZh: '生成失败会怎样？',
      aEn: `The ${tinyCredits} credits return. A card is charged only after a pack purchase completes.`,
      aZh: `这 ${tinyCredits} 积分会退回。只有积分包付款完成后才会扣银行卡。`,
    },
  ],
};

export const FAN_LIVE: LivePack = {
  cases: [
    {
      id: 'hallway-sweater',
      labelEn: 'Hallway snapshot',
      labelZh: '走廊快照',
      sources: [`${photo}/ceiling-fan-poster.svg`],
      resultPoster: `${photo}/ceiling-fan-poster.svg`,
      noteEn: 'Placeholder still. The pet wipe clip is added after this release.',
      noteZh: '占位静帧。宠物转场成片会在这次发布之后补上。',
    },
  ],
  story: {
    layout: 'fan',
    lead: {
      eyebrowEn: 'Outfit wipe',
      eyebrowZh: '换装转场',
      titleEn: 'The pet changes sweaters. You never touch a fan.',
      titleZh: '宠物换一件毛衣。你不用去碰风扇。',
      bodyEn:
        `One everyday snapshot of a pet becomes a vertical wipe of about ${fanCredits} seconds. The photo is a hallway or a plain room, casual sweater, no fan in frame. The clip wipes through generated blades into a plain raincoat. Those blades exist only in the result.`,
      bodyZh:
        `一张宠物的日常快照，做成大约 ${fanCredits} 秒的竖屏转场。照片是走廊或普通房间，一件随便的毛衣，画面里没有风扇。成片用生成的扇叶转到一件朴素的雨衣。扇叶只存在于结果里。`,
    },
    support: {
      eyebrowEn: 'One snapshot',
      eyebrowZh: '一张快照',
      titleEn: 'Ordinary clothes. Ordinary room.',
      titleZh: '普通的衣服，普通的房间。',
      bodyEn:
        'The sample is a phone picture, not a styled portrait. The second outfit is another casual layer on the same pet. The clip does not add a person.',
      bodyZh: '示例是手机照片，不是摆拍肖像。第二套衣服是同一只宠物身上的另一件日常衣服。成片不会加进一个人。',
    },
    beats: [
      {
        titleEn: 'The photo',
        titleZh: '那张照片',
        bodyEn: 'Pet, sweater, hallway light. No fan, no ladder.',
        bodyZh: '宠物、毛衣、走廊的光。没有风扇，也没有梯子。',
      },
      {
        titleEn: 'The wipe',
        titleZh: '那次转场',
        bodyEn: 'Blades cross the frame once. They are part of the clip.',
        bodyZh: '扇叶划过画面一次。它们是成片的一部分。',
      },
      {
        titleEn: 'The raincoat',
        titleZh: '那件雨衣',
        bodyEn: 'Same pet, same room, a plain second layer.',
        bodyZh: '同一只宠物，同一个房间，第二件朴素的衣服。',
      },
    ],
    diy: {
      eyebrowEn: 'Compared with doing it yourself',
      eyebrowZh: '和自己做相比',
      titleEn: 'Leave the fan on the ceiling.',
      titleZh: '让风扇留在天花板上。',
      hardTitleEn: 'Film a wipe',
      hardTitleZh: '实拍一次转场',
      hardEn: 'A spinning fan, a phone, and a pet that will wait. Do not strap a phone to a fan.',
      hardZh: '一台转着的风扇、一部手机，以及一只肯等的宠物。切勿把手机绑在风扇上。',
      easyTitleEn: 'Start from the snapshot',
      easyTitleZh: '从快照开始',
      easyEn: 'Upload one pet photo. The wipe happens in the video. You stay off the ladder.',
      easyZh: '上传一张宠物照片。转场发生在视频里。你不用爬梯子。',
    },
  },
  faq: [
    {
      id: 'what',
      qEn: 'What is Ceiling Fan?',
      qZh: 'Ceiling Fan 是什么？',
      aEn: `A pet outfit wipe of about ${fanCredits} seconds. The fan is generated.`,
      aZh: `大约 ${fanCredits} 秒的宠物换装转场。风扇是生成的。`,
    },
    {
      id: 'photo',
      qEn: 'What photo works?',
      qZh: '什么样的照片合适？',
      aEn: 'One pet in an ordinary room, casual clothes, no fan in the frame. A phone snapshot is the right kind of picture.',
      aZh: '一只宠物，普通房间，日常衣服，画面里没有风扇。手机快照就是对的那种照片。',
    },
    {
      id: 'safe',
      qEn: 'Do I film a real fan?',
      qZh: '要拍真的风扇吗？',
      aEn: 'No. Never strap a phone to a spinning fan. The blades appear only in the finished clip.',
      aZh: '不要。切勿把手机绑在旋转的风扇上。扇叶只出现在成片里。',
    },
    {
      id: 'length',
      qEn: 'How long is the video?',
      qZh: '视频有多长？',
      aEn: `About ${fanCredits} seconds. This look uses ${fanCredits} credits.`,
      aZh: `大约 ${fanCredits} 秒。这个效果扣 ${fanCredits} 积分。`,
    },
    {
      id: 'credits',
      qEn: 'How are credits calculated?',
      qZh: '积分怎么计算？',
      aEn: `This look uses ${fanCredits} credits. Packs are ${packsEn}. A failed clip returns them.`,
      aZh: `这个效果扣 ${fanCredits} 积分。套餐为 ${packsZh}。短片失败会退回。`,
    },
    {
      id: 'pets',
      qEn: 'Can I upload a person?',
      qZh: '可以上传人吗？',
      aEn: 'No. The subject is a pet. Upload a snapshot you have the right to use.',
      aZh: '不可以。主体是宠物。请上传你有权使用的快照。',
    },
    {
      id: 'refund',
      qEn: 'What if generate fails?',
      qZh: '生成失败会怎样？',
      aEn: `The ${fanCredits} credits return. A card is charged only after a pack purchase completes.`,
      aZh: `这 ${fanCredits} 积分会退回。只有积分包付款完成后才会扣银行卡。`,
    },
  ],
};
