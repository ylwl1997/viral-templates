import type { CountClass, InteractionKind, OutputVariant, PhotoLayout } from "../schema/adapted.js";
import type { CustomerImage } from "../schema/appearance.js";
import type { GenerationSegment, TemplatePack } from "../schema/pack.js";
import type { AppearanceFacts } from "../schema/appearance.js";
export interface ResolvedImage {
    roleId: string;
    url?: string;
    path?: string;
    label?: string;
    groupId?: string;
    appearance?: AppearanceFacts;
    packToken: string;
    deliveryToken: string;
    phrase: string;
}
export interface CastClassification {
    petCount: number;
    countClass: CountClass;
    photoLayout: PhotoLayout;
    interaction: InteractionKind;
    reasons: string[];
}
export type VariantRequest = "auto" | "timed-beats" | "locked-segment";
export declare function resolveImages(pack: TemplatePack, images: CustomerImage[]): ResolvedImage[];
export declare function phraseFor(label: string | undefined, appearance: AppearanceFacts | undefined): string;
export declare function classifyCast(images: ResolvedImage[]): CastClassification;
export declare function chooseVariant(segment: GenerationSegment, classification: CastClassification, requested: VariantRequest): {
    variant: OutputVariant;
    derivedFrom?: "timed-beats" | "locked-segment";
};
export declare function parseVariantRequest(value: string | undefined): VariantRequest;
