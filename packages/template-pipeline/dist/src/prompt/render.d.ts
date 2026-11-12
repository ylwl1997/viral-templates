import type { InteractionKind } from "../schema/adapted.js";
import type { TemplatePack } from "../schema/pack.js";
import type { SegmentScript } from "../schema/script.js";
import type { GenerationSegment } from "../schema/pack.js";
export interface PetPhrase {
    roleId: string;
    phrase: string;
    token: string;
    wardrobe: string;
    clothing?: string;
}
export interface RenderContext {
    filled: Set<string>;
    pets: Map<string, PetPhrase>;
    primaryRoleId: string;
    interaction: InteractionKind;
}
/** Default pack text. Tokens and identity phrases stay exactly as authored. */
export declare function renderAuthoredVariant(script: SegmentScript, roles: ReadonlyMap<string, string>, variant: "timed-beats" | "locked-segment"): string;
export declare function renderAdaptedTimed(pack: TemplatePack, segment: GenerationSegment, ctx: RenderContext): string;
export declare function renderAdaptedLocked(pack: TemplatePack, segment: GenerationSegment, ctx: RenderContext): string;
export declare function renderSingleTimed(pack: TemplatePack, segment: GenerationSegment, pet: PetPhrase): string;
export declare function renderSingleLocked(pack: TemplatePack, segment: GenerationSegment, pet: PetPhrase): string;
export declare function interactionParagraph(interaction: InteractionKind): string;
