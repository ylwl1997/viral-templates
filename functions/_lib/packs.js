/**
 * One credit is one second of the look's source clip, rounded, at least 1.
 * Prices are what checkout charges when it is configured. Do not show them
 * as payable amounts until that is true.
 * Keep src/lib/site.ts packs in sync with these numbers.
 */

export const CREDIT_PACKS = [
  { id: 'starter', label: 'Starter', labelZh: '入门', credits: 60, cents: 599 },
  { id: 'mid', label: 'Mid', labelZh: '进阶', credits: 180, cents: 1499, popular: true },
  { id: 'large', label: 'Large', labelZh: '大包', credits: 600, cents: 3999 },
];

export function packById(id) {
  if (typeof id !== 'string') return null;
  return CREDIT_PACKS.find((pack) => pack.id === id.trim()) || null;
}

export function formatCents(cents) {
  const n = Number(cents);
  if (!Number.isInteger(n) || n < 0) return '';
  return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
}

export function publicPack(pack, includePrice) {
  const row = {
    id: pack.id,
    label: pack.label,
    label_zh: pack.labelZh,
    credits: pack.credits,
    popular: Boolean(pack.popular),
  };
  if (includePrice) {
    row.cents = pack.cents;
    row.usd = formatCents(pack.cents);
  }
  return row;
}
