export {
  AGNES_BASE_URL,
  AGNES_CHAT_COMPLETIONS_PATH,
  AGNES_VIDEO_CREATE_PATH,
  AGNES_VIDEO_MODEL,
  AGNES_VIDEO_POLL_URL,
  AGNES_VISION_DEFAULT_MODEL,
  AGNES_VISION_FALLBACK_MODEL,
  MAPPING_POLICY_ID,
  MAX_SEGMENT_SEC,
  MIN_SEGMENT_SEC,
  PACK_SCHEMA_VERSION,
} from "./constants.js";

export {
  AgnesConfigError,
  DurationPolicyError,
  ImageAssignmentError,
  MissingRequiredRoleError,
  PackValidationError,
  StaleIdentityError,
  TemplatePipelineError,
  VisionOutputRejectedError,
} from "./errors.js";

export { splitDurationEven, planGenerationSegments, toPromptSeconds } from "./duration/split.js";
export type { BeatSpan, PlannedSegment } from "./duration/split.js";

export { parseTemplatePack, parseAdaptedPromptSet, syncAuthoredPrompts } from "./pack/validate.js";
export { readPack, writePack } from "./pack/io.js";

export { ingestTemplate } from "./ingest/ingest.js";
export type { IngestOptions, IngestRoleInput } from "./ingest/ingest.js";

export { adaptPack, parseCustomerImages } from "./adapt/adapt.js";
export type { AdaptOptions } from "./adapt/adapt.js";

export { classifyCast, resolveImages, chooseVariant, phraseFor } from "./prompt/classify.js";
export type { CastClassification, ResolvedImage, VariantRequest } from "./prompt/classify.js";

export { describeAppearance } from "./prompt/appearance.js";
export { renderAuthoredVariant } from "./prompt/render.js";
export { findStaleTerms } from "./prompt/stale.js";
export { assertPromptFrozen } from "./prompt/freeze.js";

export { MetadataVisionAdapter } from "./vision/metadata.js";
export {
  AgnesVisionAdapter,
  buildAgnesVisionRequest,
  parseModelJson,
  resolveAgnesVisionModel,
  disabledFetch,
  AGNES_VISION_SYSTEM_PROMPT,
} from "./vision/agnes.js";
export type { AgnesVisionAdapterOptions } from "./vision/agnes.js";
export { OpenAICompatibleVisionAdapter } from "./vision/openai.js";
export type { OpenAICompatibleVisionOptions } from "./vision/openai.js";
export type { VisionAdapter, VisionDescribeInput, VisionDescribeOutput } from "./vision/types.js";

export { formatAgnesCreatePayload } from "./providers/agnes-video.js";
export type { AgnesVideoCreateBody, AgnesVideoCreateRequest } from "./providers/agnes-video.js";

export { templatePackJsonSchema, adaptedPromptSetJsonSchema, visionRewriteJsonSchema } from "./schema/json-schema.js";

export { templatePackSchema, roleSchema, generationSegmentSchema } from "./schema/pack.js";
export type { TemplatePack, Role, StoryBeat, GenerationSegment, PromptVariant } from "./schema/pack.js";
export { adaptedPromptSetSchema } from "./schema/adapted.js";
export type {
  AdaptedPromptSet,
  CountClass,
  InteractionKind,
  OutputVariant,
  PhotoLayout,
} from "./schema/adapted.js";
export { customerImageSchema, customerJobSchema, appearanceSchema } from "./schema/appearance.js";
export type { CustomerImage, CustomerJob, AppearanceFacts } from "./schema/appearance.js";
export { visionRewriteSchema } from "./schema/vision.js";
export type { VisionRewrite } from "./schema/vision.js";
