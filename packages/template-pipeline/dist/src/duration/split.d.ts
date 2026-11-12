export interface BeatSpan {
    id: string;
    startSec: number;
    endSec: number;
}
export interface PlannedSegment {
    startSec: number;
    endSec: number;
    durationSec: number;
    beatIds: string[];
    /** `single` is one in-range clip. `even` ignores beats. `beat-groups` keeps beats whole. */
    strategy: "single" | "even" | "beat-groups";
}
/**
 * Split a template into the fewest generation segments that each last 4–12s.
 *
 * Length is divided evenly in milliseconds. A 15s template becomes 7.5s + 7.5s,
 * never 12s + 3s, because the model minimum is 4s. Integer-looking examples
 * such as "~8s + ~7s" describe that same even middle split.
 */
export declare function splitDurationEven(durationSec: number): number[];
/** Integer seconds requested from the video model. Clamped to 4–12. */
export declare function toPromptSeconds(durationSec: number): number;
/**
 * Plan generation segments.
 *
 * A template already inside 4–12s stays one segment. Longer templates use the
 * fewest whole-beat groups that stay in range, and among those the most even
 * group. If beats are missing, overlap, leave gaps, or a single beat is longer
 * than 12s, the plan falls back to {@link splitDurationEven}.
 */
export declare function planGenerationSegments(durationSec: number, beats?: BeatSpan[]): PlannedSegment[];
