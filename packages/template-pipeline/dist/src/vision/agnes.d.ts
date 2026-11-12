import { AGNES_VISION_DEFAULT_MODEL, AGNES_VISION_FALLBACK_MODEL } from "../constants.js";
import type { ChatCompletionRequest, VisionAdapter, VisionDescribeInput, VisionDescribeOutput } from "./types.js";
export { AGNES_VISION_SYSTEM_PROMPT } from "./system-prompt.js";
export { AGNES_VISION_DEFAULT_MODEL, AGNES_VISION_FALLBACK_MODEL };
export interface AgnesVisionAdapterOptions {
    /** Defaults to `AGNES_API_KEY`. Never written by this package. */
    apiKey?: string;
    /** Defaults to `agnes-3.0-flash`, or `AGNES_VISION_MODEL` when that is a flash model. */
    model?: string;
    /** Defaults to `https://api.agnes-ai.cn` or `AGNES_BASE_URL`. */
    baseUrl?: string;
    /**
     * Required to perform HTTP. The default throws, so tests and this CLI
     * cannot call the paid endpoint by accident.
     */
    fetchImpl?: typeof fetch;
    temperature?: number;
}
export declare function resolveAgnesVisionModel(requested?: string): string;
export declare function buildAgnesVisionRequest(input: VisionDescribeInput, options: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    temperature?: number;
}): ChatCompletionRequest;
/**
 * Agnes text/vision adapter (`agnes-3.0-flash` by default).
 * This builds the chat-completions request. It does not call the network
 * unless the site injects `fetchImpl`.
 */
export declare class AgnesVisionAdapter implements VisionAdapter {
    readonly id = "agnes";
    private readonly apiKey;
    private readonly model;
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly temperature;
    constructor(options?: AgnesVisionAdapterOptions);
    describe(input: VisionDescribeInput): Promise<VisionDescribeOutput>;
    private request;
}
export declare function disabledFetch(): Promise<Response>;
export declare function parseModelJson(content: string): VisionDescribeOutput;
export declare function redact(text: string): string;
