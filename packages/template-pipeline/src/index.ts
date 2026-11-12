import { AgnesVisionAdapter, MetadataVisionAdapter } from './adapters.js';
import { adaptMetadata } from './metadata.js';
import { parseTemplatePack } from './parse.js';
import { formatAgnesCreatePayload } from './payload.js';
import { planGenerationSegments, splitDurationEven, toPromptSeconds } from './segments.js';
import type { AdaptedPromptSet, CustomerImage, TemplatePack } from './types.js';

export { AgnesVisionAdapter, MetadataVisionAdapter };
export { parseTemplatePack };
export { formatAgnesCreatePayload };
export { planGenerationSegments, splitDurationEven, toPromptSeconds };
export type { AdaptedPromptSet, AgnesCreatePayload, CustomerImage, TemplatePack, Variant } from './types.js';

export type AdaptOptions = {
  adapter?: MetadataVisionAdapter | AgnesVisionAdapter;
};

/** Rewrite identity, count, and interaction. Duration, cuts, and segment bounds stay on the pack. */
export async function adaptPack(
  pack: TemplatePack | unknown,
  customerImages: CustomerImage[],
  options: AdaptOptions = {},
): Promise<AdaptedPromptSet> {
  const parsed = pack && typeof pack === 'object' && (pack as TemplatePack).schemaVersion === '1.0.0' && Array.isArray((pack as TemplatePack).generationSegments)
    ? (pack as TemplatePack)
    : parseTemplatePack(pack);
  const adapter = options.adapter || new MetadataVisionAdapter();
  return adapter.adapt(parsed, customerImages);
}

export { adaptMetadata };
