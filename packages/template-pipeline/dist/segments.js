export function fail(code) {
    const err = new Error(code);
    err.code = code;
    return err;
}
/** Integer Agnes `seconds` in 4–12. */
export function toPromptSeconds(durationSec) {
    const value = Number(durationSec);
    if (!Number.isFinite(value) || value <= 0)
        throw fail('bad_duration');
    return Math.min(12, Math.max(4, Math.round(value)));
}
/**
 * Split a clip longer than 12s into the fewest even pieces that each stay in 4–12s.
 * A clip already inside that range is one piece.
 */
export function splitDurationEven(durationSec) {
    const duration = Number(durationSec);
    if (!Number.isFinite(duration) || duration < 4)
        throw fail('bad_duration');
    const parts = duration <= 12 ? 1 : Math.ceil(duration / 12);
    const maxParts = Math.floor(duration / 4);
    if (parts > maxParts)
        throw fail('bad_duration');
    const slices = [];
    for (let index = 0; index < parts; index += 1) {
        const startSec = (duration * index) / parts;
        const endSec = (duration * (index + 1)) / parts;
        const length = endSec - startSec;
        if (length < 3.99 || length > 12.01)
            throw fail('bad_duration');
        slices.push({
            id: `segment-${index + 1}`,
            startSec,
            endSec,
            durationSec: length,
            promptSeconds: toPromptSeconds(length),
        });
    }
    return slices;
}
/** Authored editorial segments win. Otherwise the duration is split evenly. */
export function planGenerationSegments(pack) {
    if (pack.generationSegments && pack.generationSegments.length)
        return pack.generationSegments;
    return splitDurationEven(pack.sourceDurationSec).map((slice) => ({
        ...slice,
        variantPrompts: { 'timed-beats': '', 'locked-segment': '' },
    }));
}
