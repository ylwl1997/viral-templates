/** Display names kept aligned with src/lib/templates.ts. Customer UI uses the names, not these keys. */
export const TEMPLATE_CATALOG = {
  'bby-wow': { name: 'Bby Wow AI', nameZh: 'Bby Wow AI' },
  'kiss-cam': { name: 'Coldplay Kiss Cam AI', nameZh: 'Coldplay Kiss Cam AI' },
  'ceiling-fan': { name: 'Ceiling Fan Transition AI', nameZh: 'Ceiling Fan Transition AI' },
  'bulin-47': { name: 'Bulin 47', nameZh: 'Bulin 47' },
  'zombie-love': { name: 'Zombie Love', nameZh: 'Zombie Love' },
  'smalltown-boy-cats': { name: 'Smalltown Boy Cats', nameZh: 'Smalltown Boy Cats' },
  'clapping-cat': { name: 'Clapping Cat', nameZh: 'Clapping Cat' },
  'knight-cat': { name: 'Knight Cat', nameZh: 'Knight Cat' },
  'car-jump': { name: 'Car Jump', nameZh: 'Car Jump' },
};

export function getTemplate(slug) {
  if (typeof slug !== 'string') return null;
  const key = slug.trim().toLowerCase();
  const row = TEMPLATE_CATALOG[key];
  if (!row) return null;
  return { slug: key, name: row.name, nameZh: row.nameZh };
}
