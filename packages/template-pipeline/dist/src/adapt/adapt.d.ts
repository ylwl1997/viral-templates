import { type VariantRequest } from "../prompt/classify.js";
import type { AdaptedPromptSet } from "../schema/adapted.js";
import type { CustomerImage } from "../schema/appearance.js";
import type { VisionAdapter } from "../vision/types.js";
export interface AdaptOptions {
    /** `auto` picks timed-beats, locked-segment, or a single-performer collapse. */
    variant?: VariantRequest;
    /** Defaults to the deterministic metadata adapter. No network. */
    adapter?: VisionAdapter;
    /**
     * When a vision model returns text that fails schema or freeze checks,
     * discard it and return the deterministic rewrite. Default true.
     */
    failClosed?: boolean;
}
export declare function adaptPack(packInput: unknown, images: CustomerImage[], options?: AdaptOptions): Promise<AdaptedPromptSet>;
export declare function parseCustomerImages(input: unknown): {
    images: CustomerImage[];
    variant?: VariantRequest;
};
