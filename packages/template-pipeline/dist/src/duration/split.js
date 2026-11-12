import { MAX_SEGMENT_SEC, MIN_SEGMENT_SEC } from "../constants.js";
import { DurationPolicyError } from "../errors.js";
const MIN_MS = MIN_SEGMENT_SEC * 1000;
const MAX_MS = MAX_SEGMENT_SEC * 1000;
/**
 * Split a template into the fewest generation segments that each last 4–12s.
 *
 * Length is divided evenly in milliseconds. A 15s template becomes 7.5s + 7.5s,
 * never 12s + 3s, because the model minimum is 4s. Integer-looking examples
 * such as "~8s + ~7s" describe that same even middle split.
 */
export function splitDurationEven(durationSec) {
    if (!Number.isFinite(durationSec)) {
        throw new DurationPolicyError("Duration must be a finite number of seconds.");
    }
    const ms = Math.round(durationSec * 1000);
    if (ms < MIN_MS) {
        throw new DurationPolicyError(`Duration ${durationSec}s is under the ${MIN_SEGMENT_SEC}s minimum. Each generation segment must be ${MIN_SEGMENT_SEC}–${MAX_SEGMENT_SEC}s.`);
    }
    if (ms <= MAX_MS)
        return [ms / 1000];
    const count = Math.ceil(ms / MAX_MS);
    const base = Math.floor(ms / count);
    const remainder = ms - base * count;
    const parts = Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
    if (parts.some((part) => part < MIN_MS || part > MAX_MS)) {
        throw new DurationPolicyError(`Cannot split ${durationSec}s into segments that all fall between ${MIN_SEGMENT_SEC}s and ${MAX_SEGMENT_SEC}s.`);
    }
    return parts.map((part) => part / 1000);
}
/** Integer seconds requested from the video model. Clamped to 4–12. */
export function toPromptSeconds(durationSec) {
    const rounded = Math.round(durationSec);
    if (rounded < MIN_SEGMENT_SEC)
        return MIN_SEGMENT_SEC;
    if (rounded > MAX_SEGMENT_SEC)
        return MAX_SEGMENT_SEC;
    return rounded;
}
/**
 * Plan generation segments.
 *
 * A template already inside 4–12s stays one segment. Longer templates use the
 * fewest whole-beat groups that stay in range, and among those the most even
 * group. If beats are missing, overlap, leave gaps, or a single beat is longer
 * than 12s, the plan falls back to {@link splitDurationEven}.
 */
export function planGenerationSegments(durationSec, beats = []) {
    const even = splitDurationEven(durationSec);
    if (even.length === 1) {
        return [
            {
                startSec: 0,
                endSec: roundSec(durationSec),
                durationSec: roundSec(durationSec),
                beatIds: beats.map((beat) => beat.id),
                strategy: "single",
            },
        ];
    }
    if (!beatsCoverTimeline(durationSec, beats)) {
        return evenSegments(durationSec, even, beats);
    }
    const grouped = bestBeatGrouping(beats);
    return grouped ?? evenSegments(durationSec, even, beats);
}
function evenSegments(durationSec, parts, beats) {
    const segments = [];
    let cursor = 0;
    for (const part of parts) {
        const startSec = roundSec(cursor);
        const endSec = roundSec(cursor + part);
        segments.push({
            startSec,
            endSec,
            durationSec: roundSec(endSec - startSec),
            beatIds: beats
                .filter((beat) => beat.startSec < endSec - 1e-6 && beat.endSec > startSec + 1e-6)
                .map((beat) => beat.id),
            strategy: "even",
        });
        cursor += part;
    }
    const drift = roundSec(durationSec - cursor);
    if (segments.length > 0 && drift !== 0) {
        const last = segments[segments.length - 1];
        last.endSec = roundSec(last.endSec + drift);
        last.durationSec = roundSec(last.endSec - last.startSec);
    }
    return segments;
}
function bestBeatGrouping(beats) {
    const duration = beats[beats.length - 1].endSec - beats[0].startSec;
    const fewest = Math.ceil(Math.round(duration * 1000) / MAX_MS);
    const most = Math.min(beats.length, Math.floor(Math.round(duration * 1000) / MIN_MS));
    let best;
    let bestSpread = Number.POSITIVE_INFINITY;
    for (let groups = fewest; groups <= most; groups += 1) {
        for (const partition of contiguousPartitions(beats, groups)) {
            const segments = partition.map((group) => {
                const startSec = roundSec(group[0].startSec);
                const endSec = roundSec(group[group.length - 1].endSec);
                return {
                    startSec,
                    endSec,
                    durationSec: roundSec(endSec - startSec),
                    beatIds: group.map((beat) => beat.id),
                    strategy: "beat-groups",
                };
            });
            if (segments.some((segment) => segment.durationSec < MIN_SEGMENT_SEC || segment.durationSec > MAX_SEGMENT_SEC)) {
                continue;
            }
            const spread = Math.max(...segments.map((segment) => segment.durationSec)) -
                Math.min(...segments.map((segment) => segment.durationSec));
            if (spread < bestSpread - 1e-9) {
                best = segments;
                bestSpread = spread;
            }
        }
        if (best)
            return best;
    }
    return undefined;
}
function beatsCoverTimeline(durationSec, beats) {
    if (beats.length === 0)
        return false;
    const ordered = [...beats].sort((a, b) => a.startSec - b.startSec);
    if (Math.abs(ordered[0].startSec) > 0.05)
        return false;
    if (Math.abs(ordered[ordered.length - 1].endSec - durationSec) > 0.05)
        return false;
    for (let index = 0; index < ordered.length; index += 1) {
        const beat = ordered[index];
        if (beat.endSec - beat.startSec <= 0)
            return false;
        if (beat.endSec - beat.startSec > MAX_SEGMENT_SEC + 0.001)
            return false;
        if (index > 0 && Math.abs(beat.startSec - ordered[index - 1].endSec) > 0.05)
            return false;
    }
    return true;
}
function contiguousPartitions(items, groups) {
    const result = [];
    const choose = (start, left, acc) => {
        if (left === 1) {
            result.push([...acc, items.slice(start)]);
            return;
        }
        for (let end = start + 1; end <= items.length - (left - 1); end += 1) {
            choose(end, left - 1, [...acc, items.slice(start, end)]);
        }
    };
    if (groups >= 1 && groups <= items.length)
        choose(0, groups, []);
    return result;
}
function roundSec(value) {
    return Math.round(value * 1000) / 1000;
}
//# sourceMappingURL=split.js.map