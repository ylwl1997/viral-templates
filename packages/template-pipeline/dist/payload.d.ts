import type { AdaptedPromptSet, AgnesCreatePayload } from './types.js';
/** Not-sent images-only body for one generation segment. No input video. */
export declare function formatAgnesCreatePayload(adapted: AdaptedPromptSet, segmentId: string): AgnesCreatePayload;
