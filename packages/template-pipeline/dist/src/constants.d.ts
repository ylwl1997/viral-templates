/** Schema version stored on every template pack and adapted prompt set. */
export declare const PACK_SCHEMA_VERSION: "1.0.0";
/**
 * Unfilled optional roles are removed. They are never replaced with the
 * template's original animals. A required role with no image fails the job.
 */
export declare const MAPPING_POLICY_ID: "drop-unfilled";
/** Generation model. Not used to look at customer photos. */
export declare const AGNES_VIDEO_MODEL: "agnes-video-2.5";
/** Prompt-rewrite model. Sees customer photos and returns structured JSON. */
export declare const AGNES_VISION_DEFAULT_MODEL: "agnes-3.0-flash";
/** Cheaper vision fallback. Not a reasoning model. */
export declare const AGNES_VISION_FALLBACK_MODEL: "agnes-2.5-flash";
export declare const AGNES_VISION_MODELS: readonly ["agnes-3.0-flash", "agnes-2.5-flash"];
export declare const AGNES_BASE_URL = "https://api.agnes-ai.cn";
export declare const AGNES_CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
export declare const AGNES_VIDEO_CREATE_PATH = "/v1/videos";
/** Poll URL is on the API host, not under `/v1`. Documented, never called here. */
export declare const AGNES_VIDEO_POLL_URL = "https://api.agnes-ai.cn/agnesapi";
/** Inclusive generation-segment bounds. The video model rejects shorter outputs. */
export declare const MIN_SEGMENT_SEC = 4;
export declare const MAX_SEGMENT_SEC = 12;
