import type { LivePack } from './templates';

const photo = '/brand/templates';

/** Live before/after, story, and keyword FAQ. Soon templates stay out of this file. */
export const BBY_LIVE: LivePack = {
  cases: [
    {
      id: 'party-selfie',
      labelEn: 'Party selfie',
      labelZh: '派对自拍',
      sources: [`${photo}/bby-wow-source.jpg`],
      resultPoster: `${photo}/bby-wow-poster.jpg`,
      resultVideo: `${photo}/bby-wow-demo.mp4`,
      noteEn: 'On Create, this still is replaced by your photo.',
      noteZh: '在创作页，这张静帧会换成你的照片。',
    },
  ],
  story: {
    layout: 'party',
    lead: {
      eyebrowEn: 'A selfie is enough',
      eyebrowZh: '一张自拍就够',
      titleEn: 'You have the photo. Not the dance floor.',
      titleZh: '你有照片，没有舞池。',
      bodyEn:
        'A party clip usually means filming it again: a friend, a song, a room with the lights down. Bby Wow starts from one adult-consent photo and makes a short vertical dance in that frame.',
      bodyZh:
        '派对短片通常还要再拍一次：朋友、一首歌、把灯调暗的房间。Bby Wow 从一张成人同意的照片开始，做成一条竖屏热舞。',
    },
    support: {
      eyebrowEn: 'One photo',
      eyebrowZh: '为什么只要一张',
      titleEn: 'The dance follows a single person.',
      titleZh: '这支舞跟着一个人走。',
      bodyEn:
        'Upload one clear photo of one adult. That is the whole input. A second angle does not change whose dance it is.',
      bodyZh: '上传一张清晰的成人照片，这就是全部素材。多一个角度，不会改变这支舞是谁的。',
    },
    beats: [
      {
        titleEn: 'The reply',
        titleZh: '回那条消息',
        bodyEn: 'Send a dance back when the chat only has a still.',
        bodyZh: '聊天里只有一张静帧时，回一条舞。',
      },
      {
        titleEn: 'The night you didn’t film',
        titleZh: '没拍下来的那晚',
        bodyEn: 'A birthday, an afterparty, a look you already liked.',
        bodyZh: '生日、散场、你本来就喜欢的一身。',
      },
      {
        titleEn: 'Just you',
        titleZh: '只有你',
        bodyEn: 'No partner and no second camera.',
        bodyZh: '不需要舞伴，也不需要第二台机位。',
      },
    ],
    diy: {
      eyebrowEn: 'Compared with filming it',
      eyebrowZh: '和自己拍相比',
      titleEn: 'Skip the reshoot.',
      titleZh: '不必重拍那一晚。',
      hardTitleEn: 'Film the night',
      hardTitleZh: '现场再拍',
      hardEn:
        'Lighting, a song you have rights to, someone willing to hold the phone, then a cut in another app.',
      hardZh: '光线、你有权使用的音乐、愿意举着手机的人，再到另一个应用里剪。',
      easyTitleEn: 'Start from the selfie',
      easyTitleZh: '从自拍开始',
      easyEn:
        'Upload the photo you already have. Confirm you are an adult and you can use it. Generate saves the job on your account.',
      easyZh: '上传已经有的照片。确认你是成人，并且有权使用这张照片。生成会把任务记在你的账户里。',
    },
  },
  faq: [
    {
      id: 'what',
      qEn: 'What is Bby Wow AI?',
      qZh: 'Bby Wow AI 是什么？',
      aEn:
        'Bby Wow AI turns one adult-consent photo into a short vertical party-dance clip, about 10 seconds. It is an independent remix look.',
      aZh: 'Bby Wow AI 用一张成人同意的照片，做成大约 10 秒的竖屏派对舞短片。这是独立的 remix 效果。',
    },
    {
      id: 'photo',
      qEn: 'What photo works best?',
      qZh: '什么样的照片效果最好？',
      aEn:
        'One adult, face visible, ordinary light, looking toward the camera. The sample is a selfie against a plain wall in a simple black top. Skip group shots and photos of anyone who has not agreed.',
      aZh:
        '一位成人、脸部清楚、光线普通、看向镜头。示例是白墙前的自拍，黑色吊带。合影，以及没有同意的人，都不适合。',
    },
    {
      id: 'why-one',
      qEn: 'Why only one photo?',
      qZh: '为什么只要一张照片？',
      aEn: 'The dance is built around a single person. A second photo is a different look.',
      aZh: '这支舞围绕一个人。第二张照片是另一个效果。',
    },
    {
      id: 'length',
      qEn: 'How long is the video?',
      qZh: '视频有多长？',
      aEn:
        'About 10 seconds, vertical. On this demo, Generate saves a queued job and uses one credit. It does not hand back a finished file yet.',
      aZh: '大约 10 秒，竖屏。在这个演示里，生成会把任务排进账户并扣 1 积分，目前不会交回成片。',
    },
    {
      id: 'credits',
      qEn: 'How are credits calculated?',
      qZh: '积分怎么计算？',
      aEn: 'Each generate uses 1 credit. Prices on this page are demo prices. Buying credits is not open yet.',
      aZh: '每次生成扣 1 积分。本页价格是演示价格。购买积分尚未开通。',
    },
    {
      id: 'free',
      qEn: 'Is Bby Wow AI free?',
      qZh: 'Bby Wow AI 免费吗？',
      aEn:
        'No. A single clip and the credit packs have demo prices. Checkout is not open on this demo, and Generate does not return a finished video.',
      aZh: '不免费。单次和积分包都有演示价格。这个演示未开放结账，生成也不会交回成片。',
    },
    {
      id: 'kids',
      qEn: 'Can I use a child’s photo?',
      qZh: '能用孩子的照片吗？',
      aEn: 'No. Adult consent only. Do not upload photos of minors.',
      aZh: '不能。仅限成人同意。请勿上传未成年人照片。',
    },
    {
      id: 'affiliation',
      qEn: 'Are you affiliated with Karol G or CapCut?',
      qZh: '你们和 Karol G 或 CapCut 有关系吗？',
      aEn: 'No. Not affiliated with Karol G, CapCut, or any label.',
      aZh: '没有。与 Karol G、CapCut 或任何厂牌无关。',
    },
    {
      id: 'refund',
      qEn: 'What if generate fails? Is there a refund?',
      qZh: '生成失败会退款吗？',
      aEn:
        'Checkout is not open, so this demo does not take payment. A generate that does not produce a clip is not a finished purchase. Today, signed-in Generate queues a job and uses one credit, and no video file comes back. When checkout exists, refund rules will be on the Terms page.',
      aZh:
        '这个演示不收款。没有成片，就不是一次完成的购买。目前登录后生成会排队并扣 1 积分，但不会返回视频文件。真正收费后的退款规则，会写在服务条款里。',
    },
  ],
};

export const KISS_LIVE: LivePack = {
  cases: [
    {
      id: 'two-selfies',
      labelEn: 'Two selfies',
      labelZh: '两张自拍',
      sources: [`${photo}/kiss-cam-source-a.jpg`, `${photo}/kiss-cam-source-b.jpg`],
      resultPoster: `${photo}/kiss-cam-poster.jpg`,
      resultVideo: `${photo}/kiss-cam-demo.mp4`,
      noteEn: 'On Create, these two stills are replaced by your photos.',
      noteZh: '在创作页，这两张静帧会换成你的照片。',
    },
  ],
  story: {
    layout: 'stadium',
    lead: {
      eyebrowEn: 'Jumbotron',
      eyebrowZh: '球场大屏',
      titleEn: 'The stadium moment, without a ticket.',
      titleZh: '球场那个瞬间，不用买票。',
      bodyEn:
        'Kiss-cam clips online are filmed from someone else’s seats. This look is built from two photos you choose: a fan-made board, a short vertical clip.',
      bodyZh: '网上的 kiss cam 多半拍自别人的座位。这个效果用你选的两张照片做成：粉丝向的大屏，一条竖屏短片。',
    },
    support: {
      eyebrowEn: 'No concert footage',
      eyebrowZh: '没有演唱会素材',
      titleEn: 'Nothing in the clip is from the show.',
      titleZh: '成片里没有那场演出。',
      bodyEn:
        'The crowd, the lights, and the board are generated. This page is a fan-made remix. It is independent of Coldplay and CapCut. Both people in the photos must be adults who agree to appear.',
      bodyZh:
        '人群、灯光和大屏都是生成的。这是粉丝向的 remix，与 Coldplay 和 CapCut 无关。照片里的两个人都必须是同意出镜的成人。',
    },
    beats: [
      {
        titleEn: 'Photo A',
        titleZh: '照片 A',
        bodyEn: 'One adult, face visible, looking toward the camera.',
        bodyZh: '一位成人，脸部清楚，看向镜头。',
      },
      {
        titleEn: 'Photo B',
        titleZh: '照片 B',
        bodyEn: 'The other adult, same rules. Upload the two photos separately.',
        bodyZh: '另一位成人，同样的要求。两张分开上传。',
      },
      {
        titleEn: 'The board',
        titleZh: '大屏',
        bodyEn: 'The clip reads as a stadium screen. You bring photos, not a clip from the venue.',
        bodyZh: '成片看起来像球场屏幕。你带来的是照片，不是现场视频。',
      },
    ],
    diy: {
      eyebrowEn: 'Compared with being there',
      eyebrowZh: '和人在现场相比',
      titleEn: 'You bring two photos.',
      titleZh: '你要准备的是两张照片。',
      hardTitleEn: 'Be there and film it',
      hardTitleZh: '人在现场，再拍下来',
      hardEn: 'A real kiss cam needs seats, a board, and footage you almost certainly cannot use.',
      hardZh: '真正的 kiss cam 要座位、大屏，以及你多半无权使用的画面。',
      easyTitleEn: 'Two photos',
      easyTitleZh: '两张照片',
      easyEn: 'No clip from the venue. Confirm both adults consent, then generate.',
      easyZh: '不需要现场片段。确认两位成人都同意，然后生成。',
    },
  },
  faq: [
    {
      id: 'what',
      qEn: 'What is Coldplay Kiss Cam AI?',
      qZh: 'Coldplay Kiss Cam AI 是什么？',
      aEn:
        'Two adult-consent photos become a short vertical clip, about 11–12 seconds, styled like a jumbotron kiss cam. It is a fan-made look.',
      aZh: '两张成人同意的照片，做成大约 11–12 秒的竖屏短片，看起来像球场大屏上的 kiss cam。这是粉丝向的效果。',
    },
    {
      id: 'why-two',
      qEn: 'Why two photos?',
      qZh: '为什么要两张照片？',
      aEn: 'The board shows two people. Upload one photo of each adult. Both need to agree to appear.',
      aZh: '大屏上是两个人。每位成人各一张，并且都同意出镜。',
    },
    {
      id: 'footage',
      qEn: 'Does this use real concert footage?',
      qZh: '会用到真实的演唱会画面吗？',
      aEn: 'No. There is no concert footage, no broadcast, and no clip from the venue. The crowd and the board are generated.',
      aZh: '不会。没有演唱会素材，没有转播，也没有现场片段。人群和屏幕都是生成出来的效果。',
    },
    {
      id: 'affiliation',
      qEn: 'Are you official Coldplay or CapCut?',
      qZh: '你们是 Coldplay 或 CapCut 官方吗？',
      aEn: 'No. Not affiliated with Coldplay, CapCut, or any label.',
      aZh: '不是。与 Coldplay、CapCut 或任何厂牌无关。',
    },
    {
      id: 'photo',
      qEn: 'What photos work?',
      qZh: '什么样的照片适合？',
      aEn:
        'Two separate photos, one adult each, face visible, looking toward the camera. The sample pair are ordinary selfies. A concert screenshot does not belong here.',
      aZh: '两张分开的照片，各一位成人，脸部清楚，看向镜头。示例就是两张普通自拍。演唱会截图不适合放这里。',
    },
    {
      id: 'length',
      qEn: 'How long is the clip?',
      qZh: '短片有多长？',
      aEn:
        'About 11–12 seconds. On this demo, Generate queues a job and uses one credit. A finished file is not returned yet.',
      aZh: '大约 11–12 秒。这个演示里，生成会排队并扣 1 积分，目前不会交回成片。',
    },
    {
      id: 'price',
      qEn: 'How much does it cost?',
      qZh: '怎么收费？',
      aEn:
        'The two-photo look has its own demo one-shot price, higher than a one-photo look, plus the same credit packs. One generate uses one credit. Buying credits and checkout are not open yet.',
      aZh: '两张照片的效果有单独的演示单次价格，高于一张照片的效果，积分包相同。每次生成扣 1 积分。购买积分和结账都还没开放。',
    },
    {
      id: 'free',
      qEn: 'Is Coldplay Kiss Cam AI free?',
      qZh: 'Coldplay Kiss Cam AI 免费吗？',
      aEn: 'No. Demo prices are listed on this page. Checkout is not open on this demo.',
      aZh: '不免费。本页列的是演示价格。这个演示尚未开放结账。',
    },
    {
      id: 'kids',
      qEn: 'Can a child be in it?',
      qZh: '可以有孩子出镜吗？',
      aEn: 'No. Both people must be adults who consent. No minors.',
      aZh: '不可以。两个人都必须是同意出镜的成人。禁止未成年人。',
    },
    {
      id: 'refund',
      qEn: 'What if generate fails? Is there a refund?',
      qZh: '生成失败会退款吗？',
      aEn:
        'Checkout is not open, so this demo does not charge a card. A generate that does not produce a clip is not a finished purchase. Today the job is queued and a credit is used, with no video file. Refund terms for real payments will be on the Terms page when checkout exists.',
      aZh:
        '这个演示不扣银行卡。没有成片，就不是一次完成的购买。目前任务会排队并扣 1 积分，没有视频文件。真正付款后的退款规则会写在服务条款里。',
    },
  ],
};

export const FAN_LIVE: LivePack = {
  cases: [
    {
      id: 'plain-portrait',
      labelEn: 'Plain portrait',
      labelZh: '普通肖像',
      sources: [`${photo}/ceiling-fan-source.jpg`],
      resultPoster: `${photo}/ceiling-fan-poster.jpg`,
      resultVideo: `${photo}/ceiling-fan-demo.mp4`,
      noteEn: 'This portrait is the upload. The fan appears in the clip.',
      noteZh: '这张肖像是上传图。风扇出现在成片里。',
    },
  ],
  story: {
    layout: 'fan',
    lead: {
      eyebrowEn: 'Safety',
      eyebrowZh: '安全',
      titleEn: 'Never strap a phone to a fan.',
      titleZh: '切勿把手机绑在风扇上。',
      bodyEn:
        'The spinning wipe is generated. Do not mount, tape, or hang a phone on a ceiling fan or any spinning fan. This look does not ask you to film one.',
      bodyZh:
        '旋转的转场是生成的。不要把手机安装、粘贴或悬挂在吊扇或任何旋转的风扇上。这个效果不会要求你去实拍风扇。',
    },
    support: {
      eyebrowEn: 'The transition',
      eyebrowZh: '转场',
      titleEn: 'An outfit change from the photo you’re already in.',
      titleZh: '换装来自你已经在的那张照片。',
      bodyEn:
        'One adult-consent photo goes in. The clip wipes through the blades into another outfit. The second look and the fan stay inside the video.',
      bodyZh: '上传一张成人同意的照片。短片用扇叶一扫，换到另一套衣服。第二套造型和风扇都留在视频里。',
    },
    beats: [
      {
        titleEn: 'No mount',
        titleZh: '不要固定',
        bodyEn: 'The phone stays in your hand or on the desk.',
        bodyZh: '手机留在手里或桌上。',
      },
      {
        titleEn: 'No second shoot',
        titleZh: '不要再拍一套',
        bodyEn: 'You do not change clothes on camera.',
        bodyZh: '不用在镜头前换衣服。',
      },
      {
        titleEn: 'No fan in the photo',
        titleZh: '照片里不必有风扇',
        bodyEn: 'A plain portrait is enough. The sample upload is one.',
        bodyZh: '普通肖像就可以。示例的上传图就是这样。',
      },
    ],
    diy: {
      eyebrowEn: 'The version copied at home',
      eyebrowZh: '别人在家模仿的那种',
      titleEn: 'Leave that one offline.',
      titleZh: '那种做法留在线下。',
      hardTitleEn: 'Phone on the blades',
      hardTitleZh: '手机绑上扇叶',
      hardEn: 'A mount, a spinning fan, and a recording you hope stays attached.',
      hardZh: '一个固定架、一台转着的风扇、一段你希望手机别飞出去的录像。',
      easyTitleEn: 'One photo, fan stays in the clip',
      easyTitleZh: '一张照片，风扇留在片子里',
      easyEn: 'Upload a portrait. The wipe happens in the video. You stay off the ladder.',
      easyZh: '上传一张肖像。转场在视频里完成。人不用爬梯子。',
    },
  },
  faq: [
    {
      id: 'what',
      qEn: 'What is Ceiling Fan Transition AI?',
      qZh: 'Ceiling Fan Transition AI 是什么？',
      aEn:
        'A one-photo outfit change, about 12–15 seconds, with a ceiling-fan wipe as the cut. The fan is generated. You do not film a fan.',
      aZh: '一张照片的换装效果，大约 12–15 秒，用吊扇扫过作为转场。风扇是生成的。你不需要去拍一台风扇。',
    },
    {
      id: 'fan-in-photo',
      qEn: 'Does the photo need a ceiling fan?',
      qZh: '照片里一定要有吊扇吗？',
      aEn:
        'No. The sample upload is a plain portrait with no fan in frame. The blades and the second outfit show up in the clip.',
      aZh: '不用。示例的上传图是一张普通肖像，画面里没有风扇。扇叶和第二套衣服出现在成片里。',
    },
    {
      id: 'safety',
      qEn: 'Can I strap my phone to a real fan to copy this?',
      qZh: '可以把手机绑在真风扇上模仿吗？',
      aEn:
        'No. Never mount, tape, or hang a phone on a spinning fan. This product does not ask you to. The wipe exists only in the generated clip.',
      aZh: '不可以。不要把手机安装、粘贴或挂在旋转的风扇上。这个产品不会要求你这么做。转场只在生成的视频里。',
    },
    {
      id: 'photo',
      qEn: 'What photo works best?',
      qZh: '什么样的照片效果最好？',
      aEn:
        'One adult, face visible, ordinary indoor light. The sample is a portrait in a white T-shirt. The outfit change happens in the clip.',
      aZh: '一位成人，脸部清楚，室内普通光线。示例是白 T 恤的肖像。换装发生在短片里。',
    },
    {
      id: 'length',
      qEn: 'How long is the video?',
      qZh: '视频有多长？',
      aEn:
        'About 12–15 seconds. Generate queues a job and uses one credit. A finished file is not available on this demo yet.',
      aZh: '大约 12–15 秒。生成会排队并扣 1 积分。这个演示目前还没有成片文件。',
    },
    {
      id: 'credits',
      qEn: 'How are credits calculated?',
      qZh: '积分怎么计算？',
      aEn: 'One generate uses 1 credit. Prices on this page are a demo. Buying credits is not open.',
      aZh: '每次生成 1 积分。本页是演示价格。购买积分尚未开通。',
    },
    {
      id: 'free',
      qEn: 'Is Ceiling Fan Transition AI free?',
      qZh: 'Ceiling Fan Transition AI 免费吗？',
      aEn: 'No. Demo prices are listed, checkout is not open, and Generate does not return a finished video.',
      aZh: '不免费。有演示价格，结账未开放，生成也不会交回成片。',
    },
    {
      id: 'kids',
      qEn: 'Can I use a child’s photo?',
      qZh: '能用孩子的照片吗？',
      aEn: 'No. Adult consent only. No minors.',
      aZh: '不能。仅限成人同意。禁止未成年人。',
    },
    {
      id: 'capcut',
      qEn: 'Is this a CapCut template?',
      qZh: '这是 CapCut 模板吗？',
      aEn: 'No. Not affiliated with CapCut. You do not need a CapCut account, and this does not export a CapCut project.',
      aZh: '不是。与 CapCut 无关。不需要 CapCut 账号，也不会导出 CapCut 工程。',
    },
    {
      id: 'refund',
      qEn: 'What if generate fails? Is there a refund?',
      qZh: '生成失败会退款吗？',
      aEn:
        'This demo does not take payment. If a generate does not produce a clip, that is not a finished result. Today, signed-in Generate queues a job and uses a credit, and no video file comes back. Paid refund rules will be on Terms when checkout opens.',
      aZh:
        '这个演示不收款。生成如果没有成片，就不是完成的结果。目前登录后会排队并扣 1 积分，没有视频文件。结账开放后，退款规则写在服务条款里。',
    },
  ],
};
