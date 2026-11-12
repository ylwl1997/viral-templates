import type { AppearanceFacts } from "../schema/appearance.js";
/** Noun phrase such as "a solid grey Siberian husky with amber eyes". */
export declare function describeAppearance(facts: AppearanceFacts): string;
export declare function ensureArticle(label: string): string;
export declare function stripArticle(phrase: string): string;
export declare function hasAppearanceFacts(facts: AppearanceFacts | undefined): boolean;
/**
 * Clothing stored on a role is a noun phrase ("a red cap and a hoodie").
 * Customer `appearance.clothing` may be "yellow raincoat" or "a yellow raincoat".
 */
export declare function clothingReplacement(previous: string, clothing: string): string;
export declare function wearingClause(wardrobe: string): string;
