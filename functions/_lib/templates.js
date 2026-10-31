/** Display names and photo counts kept aligned with src/lib/templates.ts. */
export const TEMPLATE_CATALOG = {
  'bby-wow': { name: 'Bby Wow AI', nameZh: 'Bby Wow AI', photoCount: 1 },
  'kiss-cam': { name: 'Coldplay Kiss Cam AI', nameZh: 'Coldplay Kiss Cam AI', photoCount: 2 },
  'ceiling-fan': { name: 'Ceiling Fan Transition AI', nameZh: 'Ceiling Fan Transition AI', photoCount: 1 },
  'bulin-47': { name: 'Bulin 47', nameZh: 'Bulin 47', photoCount: 1 },
  'zombie-love': { name: 'Zombie Love', nameZh: 'Zombie Love', photoCount: 1 },
  'smalltown-boy-cats': { name: 'Smalltown Boy Cats', nameZh: 'Smalltown Boy Cats', photoCount: 1 },
  'clapping-cat': { name: 'Clapping Cat', nameZh: 'Clapping Cat', photoCount: 1 },
  'knight-cat': { name: 'Knight Cat', nameZh: 'Knight Cat', photoCount: 1 },
  'car-jump': { name: 'Car Jump', nameZh: 'Car Jump', photoCount: 1 },
};

export function getTemplate(slug) {
  if (typeof slug !== 'string') return null;
  const key = slug.trim().toLowerCase();
  const row = TEMPLATE_CATALOG[key];
  if (!row) return null;
  return { slug: key, name: row.name, nameZh: row.nameZh, photoCount: row.photoCount === 2 ? 2 : 1 };
}
