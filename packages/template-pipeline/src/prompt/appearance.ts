import type { AppearanceFacts } from "../schema/appearance.js";

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function article(noun: string): "a" | "an" {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Noun phrase such as "a solid grey Siberian husky with amber eyes". */
export function describeAppearance(facts: AppearanceFacts): string {
  const breed = clean(facts.breed) || clean(facts.species) || "pet";
  const colors = (facts.colors ?? []).map(clean).filter(Boolean);
  const prefix = colors.filter((color) => !breed.toLowerCase().includes(color.toLowerCase()));
  const core = [...prefix, breed].join(" ");
  const traits: string[] = [];
  if (clean(facts.eyes)) traits.push(`${clean(facts.eyes)} eyes`);
  const markings = (facts.markings ?? []).map(clean).filter(Boolean);
  if (markings.length) traits.push(markings.join(", "));
  const described = traits.length ? `${core} with ${joinAnd(traits)}` : core;
  return `${article(core)} ${described}`;
}

export function ensureArticle(label: string): string {
  const trimmed = label.trim();
  if (/^(a|an|the)\s+/i.test(trimmed)) return trimmed;
  return `${article(trimmed)} ${trimmed}`;
}

export function stripArticle(phrase: string): string {
  return phrase.replace(/^(a|an|the)\s+/i, "");
}

export function hasAppearanceFacts(facts: AppearanceFacts | undefined): boolean {
  if (!facts) return false;
  return Boolean(
    facts.species ||
      facts.breed ||
      facts.eyes ||
      facts.clothing ||
      facts.colors?.length ||
      facts.markings?.length ||
      (facts.count && facts.count > 1),
  );
}

/**
 * Clothing stored on a role is a noun phrase ("a red cap and a hoodie").
 * Customer `appearance.clothing` may be "yellow raincoat" or "a yellow raincoat".
 */
export function clothingReplacement(previous: string, clothing: string): string {
  const trimmed = clothing.trim();
  if (/^(in|wearing)\b/i.test(trimmed)) return trimmed;
  const withArticle = /^(a|an)\b/i.test(trimmed) ? trimmed : `${article(trimmed)} ${trimmed}`;
  if (previous.startsWith("in ")) return `in ${withArticle}`;
  return withArticle;
}

export function wearingClause(wardrobe: string): string {
  const trimmed = wardrobe.trim();
  if (!trimmed) return "";
  if (/^wearing\b/i.test(trimmed)) return trimmed;
  if (/^(a|an|the)\b/i.test(trimmed)) return `wearing ${trimmed}`;
  return `wearing ${article(trimmed)} ${trimmed}`;
}
