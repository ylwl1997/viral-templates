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

export const TEMPLATE_CATALOG = {
  'bby-wow': {
    name: 'Bby Wow AI',
    nameZh: 'Bby Wow AI',
    photoCount: 1,
    durationSeconds: 6.041667,
    referenceVideo: '/brand/templates/bby-wow-demo.mp4',
  },
  'kiss-cam': {
    name: 'Coldplay Kiss Cam AI',
    nameZh: 'Coldplay Kiss Cam AI',
    photoCount: 2,
    durationSeconds: 6.041667,
    referenceVideo: '/brand/templates/kiss-cam-demo.mp4',
  },
  'ceiling-fan': {
    name: 'Ceiling Fan Transition AI',
    nameZh: 'Ceiling Fan Transition AI',
    photoCount: 1,
    durationSeconds: 15.278005,
    referenceVideo: '/brand/templates/ceiling-fan-demo.mp4',
  },
  'bulin-47': { name: 'Bulin 47', nameZh: 'Bulin 47', photoCount: 1 },
  'zombie-love': { name: 'Zombie Love', nameZh: 'Zombie Love', photoCount: 1 },
  'smalltown-boy-cats': { name: 'Smalltown Boy Cats', nameZh: 'Smalltown Boy Cats', photoCount: 1 },
  'clapping-cat': { name: 'Clapping Cat', nameZh: 'Clapping Cat', photoCount: 1 },
  'knight-cat': { name: 'Knight Cat', nameZh: 'Knight Cat', photoCount: 1 },
  'car-jump': { name: 'Car Jump', nameZh: 'Car Jump', photoCount: 1 },
};

/**
 * @param {string} slug
 * @returns {null | {
 *   slug: string,
 *   name: string,
 *   nameZh: string,
 *   photoCount: 1 | 2,
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
  return {
    slug: key,
    name: row.name,
    nameZh: row.nameZh,
    photoCount: row.photoCount === 2 ? 2 : 1,
    durationSeconds,
    creditCost: durationSeconds == null ? 0 : creditsForDuration(durationSeconds),
    referenceVideo,
  };
}
