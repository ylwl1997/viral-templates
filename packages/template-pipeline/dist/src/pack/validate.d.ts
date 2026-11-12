import { type AdaptedPromptSet } from "../schema/adapted.js";
import { type TemplatePack } from "../schema/pack.js";
export declare function parseTemplatePack(input: unknown): TemplatePack;
export declare function parseAdaptedPromptSet(input: unknown): AdaptedPromptSet;
export declare function assertPackInvariants(pack: TemplatePack): void;
/** Rewrite variant prompt strings from their scripts, then validate. */
export declare function syncAuthoredPrompts(pack: TemplatePack): TemplatePack;
export declare function roleTokenOrder(pack: TemplatePack): string[];
