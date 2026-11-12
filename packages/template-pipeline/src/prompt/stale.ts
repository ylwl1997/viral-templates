import type { TemplatePack } from "../schema/pack.js";

export function findStaleTerms(prompt: string, pack: TemplatePack, allowedText: string): string[] {
  const allowed = allowedText.toLowerCase();
  const hits: string[] = [];
  const terms = [
    ...pack.templateAnimalTerms,
    ...pack.roles.flatMap((role) => role.staleTerms),
  ];
  const seen = new Set<string>();
  for (const term of terms) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (allowed.includes(key)) continue;
    if (includesTerm(prompt, term)) hits.push(term);
  }
  return hits;
}

function includesTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}
