/** Schema version stored on every template pack and adapted prompt set. */
export const PACK_SCHEMA_VERSION = "1.0.0" as const;

/**
 * Unfilled optional roles are removed. They are never replaced with the
 * template's original animals. A required role with no image fails the job.
 */
export const MAPPING_POLICY_ID = "drop-unfilled" as const;

/** Generation model. Not used to look at customer photos. */
export const AGNES_VIDEO_MODEL = "agnes-video-2.5" as const;

/** Prompt-rewrite model. Sees customer photos and returns structured JSON. */
export const AGNES_VISION_DEFAULT_MODEL = "agnes-3.0-flash" as const;

/** Cheaper vision fallback. Not a reasoning model. */
export const AGNES_VISION_FALLBACK_MODEL = "agnes-2.5-flash" as const;

export const AGNES_VISION_MODELS = [
  AGNES_VISION_DEFAULT_MODEL,
  AGNES_VISION_FALLBACK_MODEL,
] as const;

export const AGNES_BASE_URL = "https://api.agnes-ai.cn";

export const AGNES_CHAT_COMPLETIONS_PATH = "/v1/chat/completions";

export const AGNES_VIDEO_CREATE_PATH = "/v1/videos";

/** Poll URL is on the API host, not under `/v1`. Documented, never called here. */
export const AGNES_VIDEO_POLL_URL = "https://api.agnes-ai.cn/agnesapi";

/** Inclusive generation-segment bounds. The video model rejects shorter outputs. */
export const MIN_SEGMENT_SEC = 4;

export const MAX_SEGMENT_SEC = 12;
