import type { GenerationSegment, TemplatePack } from './types.js';
export declare function fail(code: string): Error;
/** Integer Agnes `seconds` in 4–12. */
export declare function toPromptSeconds(durationSec: number): number;
export type EvenSlice = {
    id: string;
    startSec: number;
    endSec: number;
    durationSec: number;
    promptSeconds: number;
};
/**
 * Split a clip longer than 12s into the fewest even pieces that each stay in 4–12s.
 * A clip already inside that range is one piece.
 */
export declare function splitDurationEven(durationSec: number): EvenSlice[];
/** Authored editorial segments win. Otherwise the duration is split evenly. */
export declare function planGenerationSegments(pack: Pick<TemplatePack, 'sourceDurationSec' | 'generationSegments'>): GenerationSegment[];
