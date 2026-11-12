import {
  AGNES_BASE_URL,
  AGNES_CHAT_COMPLETIONS_PATH,
  AGNES_VISION_DEFAULT_MODEL,
  AGNES_VISION_FALLBACK_MODEL,
  AGNES_VISION_MODELS,
} from "../constants.js";
import { AgnesConfigError, VisionOutputRejectedError } from "../errors.js";
import { visionRewriteSchema } from "../schema/vision.js";
import { AGNES_VISION_SYSTEM_PROMPT } from "./system-prompt.js";
import type { ChatCompletionRequest, VisionAdapter, VisionDescribeInput, VisionDescribeOutput } from "./types.js";

export { AGNES_VISION_SYSTEM_PROMPT } from "./system-prompt.js";
export { AGNES_VISION_DEFAULT_MODEL, AGNES_VISION_FALLBACK_MODEL };

const BLOCKED_MODELS = new Set([
  "agnes-2.5-pro",
  "agnes-2.5-pro-beta",
  "agnes-2.5-pro-theta",
  "agnes-3.0-pro",
]);

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

export function resolveAgnesVisionModel(requested?: string): string {
  const model = requested?.trim() || AGNES_VISION_DEFAULT_MODEL;
  if (BLOCKED_MODELS.has(model)) {
    throw new AgnesConfigError(
      `${model} is not available to this adapter. Use ${AGNES_VISION_DEFAULT_MODEL} (default) or ${AGNES_VISION_FALLBACK_MODEL}. agnes-2.5-pro is a paid reasoning model and is not the default. agnes-3.0-pro is not launched.`,
    );
  }
  if (!AGNES_VISION_MODELS.includes(model as (typeof AGNES_VISION_MODELS)[number])) {
    throw new AgnesConfigError(
      `Agnes vision model must be ${AGNES_VISION_MODELS.join(" or ")}. Received "${model}".`,
    );
  }
  return model;
}

export function buildAgnesVisionRequest(
  input: VisionDescribeInput,
  options: { apiKey: string; model?: string; baseUrl?: string; temperature?: number },
): ChatCompletionRequest {
  const model = resolveAgnesVisionModel(options.model);
  const base = (options.baseUrl ?? AGNES_BASE_URL).replace(/\/$/, "");
  const content: ChatCompletionRequest["body"]["messages"][number]["content"] = [
    { type: "text", text: userPayload(input) },
  ];
  for (const image of input.images) {
    if (!image.url || !/^https?:\/\//i.test(image.url)) {
      throw new AgnesConfigError(
        `Role "${image.roleId}" needs a public http(s) image URL before Agnes vision can see it. Local paths stay on the metadata adapter.`,
      );
    }
    content.push({ type: "image_url", image_url: { url: image.url } });
  }
  return {
    url: `${base}${AGNES_CHAT_COMPLETIONS_PATH}`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: {
      model,
      temperature: options.temperature ?? 0.2,
      max_tokens: 4096,
      messages: [
        { role: "system", content: AGNES_VISION_SYSTEM_PROMPT },
        { role: "user", content },
      ],
    },
  };
}

/**
 * Agnes text/vision adapter (`agnes-3.0-flash` by default).
 * This builds the chat-completions request. It does not call the network
 * unless the site injects `fetchImpl`.
 */
export class AgnesVisionAdapter implements VisionAdapter {
  readonly id = "agnes";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly temperature: number;

  constructor(options: AgnesVisionAdapterOptions = {}) {
    const requested = options.model ?? process.env.AGNES_VISION_MODEL;
    this.model = resolveAgnesVisionModel(requested);
    this.apiKey = options.apiKey ?? process.env.AGNES_API_KEY ?? "";
    this.baseUrl = options.baseUrl ?? process.env.AGNES_BASE_URL ?? AGNES_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? disabledFetch;
    this.temperature = options.temperature ?? 0.2;
  }

  async describe(input: VisionDescribeInput): Promise<VisionDescribeOutput> {
    if (!this.apiKey) {
      throw new AgnesConfigError("AGNES_API_KEY is not set. The metadata adapter does not need a key.");
    }
    try {
      return await this.request(input, this.model);
    } catch (error) {
      if (this.model === AGNES_VISION_DEFAULT_MODEL && isModelUnavailable(error)) {
        return this.request(input, AGNES_VISION_FALLBACK_MODEL);
      }
      throw error;
    }
  }

  private async request(input: VisionDescribeInput, model: string): Promise<VisionDescribeOutput> {
    const request = buildAgnesVisionRequest(input, {
      apiKey: this.apiKey,
      model,
      baseUrl: this.baseUrl,
      temperature: this.temperature,
    });
    let response: Response;
    try {
      response = await this.fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vision request failed.";
      throw new AgnesConfigError(redact(message));
    }
    const raw = await response.text();
    if (!response.ok) {
      const error = new AgnesConfigError(redact(`Agnes vision HTTP ${response.status}: ${raw.slice(0, 500)}`));
      (error as AgnesConfigError & { status?: number }).status = response.status;
      throw error;
    }
    const content = readAssistantContent(raw);
    const parsed = parseModelJson(content);
    return { ...parsed, model };
  }
}

export function disabledFetch(): Promise<Response> {
  return Promise.reject(
    new AgnesConfigError(
      "Agnes network calls are disabled in this build. Pass fetchImpl from the site process when you are ready to call chat completions. This package never sends the request itself.",
    ),
  );
}

function userPayload(input: VisionDescribeInput): string {
  const segments = input.pack.generationSegments.map((segment) => ({
    id: segment.id,
    startSec: segment.startSec,
    endSec: segment.endSec,
    durationSec: segment.durationSec,
    promptSeconds: segment.promptSeconds,
    prompts: segment.variantPrompts,
  }));
  return JSON.stringify({
    task: "Classify the customer photos and rewrite every segment prompt.",
    aspectRatio: input.pack.aspectRatio,
    styleLine: input.pack.styleLine,
    filledRoleIds: input.filledRoleIds,
    unfilledRoleIds: input.unfilledRoleIds,
    doNotInventRoles: input.unfilledRoleIds,
    images: input.images.map((image) => ({
      roleId: image.roleId,
      token: image.deliveryToken,
      packToken: image.packToken,
      label: image.label ?? null,
    })),
    segments,
  });
}

export function parseModelJson(content: string): VisionDescribeOutput {
  const jsonText = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch {
    throw new VisionOutputRejectedError("Agnes vision did not return JSON. The prose was discarded.");
  }
  const parsed = visionRewriteSchema.safeParse(value);
  if (!parsed.success) {
    throw new VisionOutputRejectedError(
      `Agnes vision JSON failed schema validation: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  return parsed.data;
}

function readAssistantContent(raw: string): string {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new VisionOutputRejectedError("Agnes chat response was not JSON.");
  }
  const content = (body as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new VisionOutputRejectedError("Agnes chat response had no message content.");
  }
  return content;
}

function isModelUnavailable(error: unknown): boolean {
  if (!(error instanceof AgnesConfigError)) return false;
  return /\b404\b|\bmodel\b/i.test(error.message) && /\b404\b|\b400\b/.test(error.message);
}

export function redact(text: string): string {
  return text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}
