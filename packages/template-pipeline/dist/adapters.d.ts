import type { AdaptedPromptSet, CustomerImage, TemplatePack } from './types.js';
/** Deterministic rewrite. No network. */
export declare class MetadataVisionAdapter {
    adapt(pack: TemplatePack, customerImages: CustomerImage[]): AdaptedPromptSet;
}
/**
 * Optional vision rewrite. The site does not construct this unless a fetch
 * implementation is injected. Invalid JSON or moved time codes are discarded.
 */
export declare class AgnesVisionAdapter {
    private readonly fetchImpl?;
    constructor(fetchImpl?: typeof fetch | undefined);
    adapt(pack: TemplatePack, customerImages: CustomerImage[]): Promise<AdaptedPromptSet>;
}
