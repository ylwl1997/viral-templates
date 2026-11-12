import type { OutputVariant } from "../schema/adapted.js";
import type { GenerationSegment, TemplatePack } from "../schema/pack.js";
/**
 * Reject a prompt that moves aspect, time codes, or the segment's camera anchors.
 * Identity and interaction sentences are allowed to change.
 */
export declare function assertPromptFrozen(pack: TemplatePack, segment: GenerationSegment, variant: OutputVariant, derivedFrom: "timed-beats" | "locked-segment" | undefined, prompt: string): void;
