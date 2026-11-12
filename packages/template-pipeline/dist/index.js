import { AgnesVisionAdapter, MetadataVisionAdapter } from './adapters.js';
import { adaptMetadata } from './metadata.js';
import { parseTemplatePack } from './parse.js';
import { formatAgnesCreatePayload } from './payload.js';
import { planGenerationSegments, splitDurationEven, toPromptSeconds } from './segments.js';
export { AgnesVisionAdapter, MetadataVisionAdapter };
export { parseTemplatePack };
export { formatAgnesCreatePayload };
export { planGenerationSegments, splitDurationEven, toPromptSeconds };
/** Rewrite identity, count, and interaction. Duration, cuts, and segment bounds stay on the pack. */
export async function adaptPack(pack, customerImages, options = {}) {
    const parsed = pack && typeof pack === 'object' && pack.schemaVersion === '1.0.0' && Array.isArray(pack.generationSegments)
        ? pack
        : parseTemplatePack(pack);
    const adapter = options.adapter || new MetadataVisionAdapter();
    return adapter.adapt(parsed, customerImages);
}
export { adaptMetadata };
