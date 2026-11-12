/**
 * Display names and photo counts stay aligned with src/lib/templates.ts.
 * durationSeconds is the only price input. creditCost is derived from it.
 */

/**
 * One credit per second of the source clip, rounded, at least 1.
 * A missing or non-positive duration is not charged.
 * @param {number} durationSeconds
 * @returns {number}
 */
export function creditsForDuration(durationSeconds) {
  const seconds = Number(durationSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds));
}

function sourceDuration(raw) {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds;
}

function slotText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 80 || /[<>]/.test(text)) return '';
  return text;
}

function photoCountOf(row, key) {
  const count = Number(row && row.photoCount);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`${key} photoCount must be a positive integer`);
  }
  return count;
}

/**
 * Two-person looks name each slot. Photo A is the left person in Kiss Cam
 * (source-a). Photo B is the right person (source-b). The prompt and Create
 * copy both read these fields.
 */
function photoSlotsOf(row, photoCount, key) {
  if (photoCount <= 1) return null;
  if (!Array.isArray(row.photoSlots) || row.photoSlots.length !== photoCount) {
    throw new Error(`${key} photoSlots must match photoCount`);
  }
  return row.photoSlots.map((slot, index) => {
    const cleaned = {
      labelEn: slotText(slot && slot.labelEn),
      labelZh: slotText(slot && slot.labelZh),
      replacesEn: slotText(slot && slot.replacesEn),
      replacesZh: slotText(slot && slot.replacesZh),
    };
    if (!cleaned.labelEn || !cleaned.labelZh || !cleaned.replacesEn || !cleaned.replacesZh) {
      throw new Error(`${key} photo slot ${index + 1} is incomplete`);
    }
    return cleaned;
  });
}

export const TEMPLATE_CATALOG = {
  'bby-wow': {
    name: 'Bby Wow',
    nameZh: 'Bby Wow',
    photoCount: 1,
    minPhotos: 1,
    durationSeconds: 6.041667,
    packId: 'bby-wow-pets',
  },
  'tiny-desk': {
    name: 'Tiny Desk',
    nameZh: 'Tiny Desk',
    photoCount: 5,
    minPhotos: 1,
    photoSlots: [
      {
        labelEn: 'Lead',
        labelZh: '主唱',
        replacesEn: 'the lead pet at the microphone',
        replacesZh: '麦克风前的主唱宠物',
      },
      {
        labelEn: 'Keys',
        labelZh: '键盘',
        replacesEn: 'the pet at the keyboard',
        replacesZh: '键盘前的宠物',
      },
      {
        labelEn: 'Left',
        labelZh: '左侧',
        replacesEn: 'the pet on the left',
        replacesZh: '左边的宠物',
      },
      {
        labelEn: 'Right',
        labelZh: '右侧',
        replacesEn: 'the pet on the right',
        replacesZh: '右边的宠物',
      },
      {
        labelEn: 'Sax',
        labelZh: '萨克斯',
        replacesEn: 'the pet with the saxophone',
        replacesZh: '拿萨克斯的宠物',
      },
    ],
    durationSeconds: 17.76,
    packId: 'tiny-desk-pets',
  },
  'ceiling-fan': {
    name: 'Ceiling Fan',
    nameZh: 'Ceiling Fan',
    photoCount: 1,
    minPhotos: 1,
    durationSeconds: 15.278005,
    packId: 'ceiling-fan-pets',
  },
  'kiss-cam': {
    name: 'Coldplay Kiss Cam AI',
    nameZh: 'Coldplay Kiss Cam AI',
    photoCount: 2,
    retired: true,
    photoSlots: [
      {
        labelEn: 'Photo A',
        labelZh: '照片 A',
        replacesEn: 'the pet on the left',
        replacesZh: '画面左边的宠物',
      },
      {
        labelEn: 'Photo B',
        labelZh: '照片 B',
        replacesEn: 'the pet on the right',
        replacesZh: '画面右边的宠物',
      },
    ],
    durationSeconds: 6.041667,
  },
  'bulin-47': { name: 'Bulin 47', nameZh: 'Bulin 47', photoCount: 1 },
  'zombie-love': { name: 'Zombie Love', nameZh: 'Zombie Love', photoCount: 1 },
  'smalltown-boy-cats': { name: 'Smalltown Boy Cats', nameZh: 'Smalltown Boy Cats', photoCount: 1 },
  'clapping-cat': { name: 'Clapping Cat', nameZh: 'Clapping Cat', photoCount: 1 },
  'knight-cat': { name: 'Knight Cat', nameZh: 'Knight Cat', photoCount: 1 },
  'car-jump': { name: 'Car Jump', nameZh: 'Car Jump', photoCount: 1 },
  // Ops-only mix path. Not a customer look and not listed on the site.
  'bailian-fixture': {
    name: 'Mix fixture',
    nameZh: 'Mix fixture',
    photoCount: 1,
    durationSeconds: 6,
    referenceVideo: '/brand/templates/bby-wow-demo.mp4',
    internal: true,
  },
};

/**
 * @param {string} slug
 * @returns {null | {
 *   slug: string,
 *   name: string,
 *   nameZh: string,
 *   photoCount: number,
 *   photoSlots: null | Array<{ labelEn: string, labelZh: string, replacesEn: string, replacesZh: string }>,
 *   durationSeconds: number | null,
 *   creditCost: number,
 *   referenceVideo: string | null,
 * }}
 */
export function getTemplate(slug) {
  if (typeof slug !== 'string') return null;
  const key = slug.trim().toLowerCase();
  const row = TEMPLATE_CATALOG[key];
  if (!row) return null;
  if (Object.prototype.hasOwnProperty.call(row, 'creditCost')) {
    throw new Error(`${key} must not set creditCost; it is derived from durationSeconds`);
  }
  const referenceVideo =
    typeof row.referenceVideo === 'string' && row.referenceVideo.startsWith('/brand/templates/')
      ? row.referenceVideo
      : null;
  const durationSeconds = sourceDuration(row.durationSeconds);
  if (referenceVideo && durationSeconds == null) {
    throw new Error(`${key} has a source video and no durationSeconds`);
  }
  const photoCount = photoCountOf(row, key);
  const minPhotos = row.minPhotos == null ? 1 : Number(row.minPhotos);
  if (!Number.isInteger(minPhotos) || minPhotos < 1 || minPhotos > photoCount) {
    throw new Error(`${key} minPhotos is outside photoCount`);
  }
  return {
    slug: key,
    name: row.name,
    nameZh: row.nameZh,
    photoCount,
    minPhotos,
    photoSlots: photoSlotsOf(row, photoCount, key),
    durationSeconds,
    creditCost: durationSeconds == null ? 0 : creditsForDuration(durationSeconds),
    referenceVideo,
    packId: typeof row.packId === 'string' ? row.packId : null,
    retired: row.retired === true,
    internal: row.internal === true,
    creatable: row.retired !== true && durationSeconds != null && typeof row.packId === 'string',
  };
}
