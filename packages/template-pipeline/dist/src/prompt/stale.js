export function findStaleTerms(prompt, pack, allowedText) {
    const allowed = allowedText.toLowerCase();
    const hits = [];
    const terms = [
        ...pack.templateAnimalTerms,
        ...pack.roles.flatMap((role) => role.staleTerms),
    ];
    const seen = new Set();
    for (const term of terms) {
        const key = term.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        if (allowed.includes(key))
            continue;
        if (includesTerm(prompt, term))
            hits.push(term);
    }
    return hits;
}
function includesTerm(text, term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}
//# sourceMappingURL=stale.js.map