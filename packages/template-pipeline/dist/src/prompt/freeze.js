import { PackValidationError } from "../errors.js";
const FOREIGN_RATIOS = ["16:9", "1:1", "4:3", "3:4", "21:9", "9:16"];
/**
 * Reject a prompt that moves aspect, time codes, or the segment's camera anchors.
 * Identity and interaction sentences are allowed to change.
 */
export function assertPromptFrozen(pack, segment, variant, derivedFrom, prompt) {
    if (!prompt.includes(pack.aspectRatio)) {
        throw new PackValidationError(`Segment "${segment.id}" dropped aspect ratio ${pack.aspectRatio}.`);
    }
    for (const ratio of FOREIGN_RATIOS) {
        if (ratio !== pack.aspectRatio && prompt.includes(ratio)) {
            throw new PackValidationError(`Segment "${segment.id}" introduced aspect ratio ${ratio}.`);
        }
    }
    for (const anchor of segment.script.styleAnchors) {
        if (!prompt.includes(anchor)) {
            throw new PackValidationError(`Segment "${segment.id}" dropped style anchor "${anchor}".`);
        }
    }
    const timed = variant === "timed-beats" || (variant === "single-performer" && derivedFrom !== "locked-segment");
    if (timed) {
        for (const cue of segment.script.timedCues) {
            if (!prompt.includes(cue.label)) {
                throw new PackValidationError(`Segment "${segment.id}" dropped time code ${cue.label}.`);
            }
            if (!prompt.includes(cue.anchor)) {
                throw new PackValidationError(`Segment "${segment.id}" dropped camera anchor "${cue.anchor}".`);
            }
        }
        return;
    }
    if (!/no hard cuts/i.test(prompt)) {
        throw new PackValidationError(`Segment "${segment.id}" dropped the locked-segment "no hard cuts" constraint.`);
    }
    if (!prompt.includes(segment.script.lockedCamera)) {
        throw new PackValidationError(`Segment "${segment.id}" dropped the locked camera line.`);
    }
}
//# sourceMappingURL=freeze.js.map