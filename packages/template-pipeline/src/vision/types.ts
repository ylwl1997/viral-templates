import type { CountClass, InteractionKind, OutputVariant, PhotoLayout } from "../schema/adapted.js";
import type { AppearanceFacts } from "../schema/appearance.js";
import type { TemplatePack } from "../schema/pack.js";
import type { ResolvedImage } from "../prompt/classify.js";

export interface VisionDescribeInput {
  pack: TemplatePack;
  images: ResolvedImage[];
  filledRoleIds: string[];
  unfilledRoleIds: string[];
}

export interface VisionAppearance {
  roleId: string;
  appearance: AppearanceFacts;
  phrase: string;
}

export interface VisionDescribeOutput {
  appearances?: VisionAppearance[];
  petCount?: number;
  countClass?: CountClass;
  photoLayout?: PhotoLayout;
  interaction?: InteractionKind;
  segments?: Array<{ id: string; variant: OutputVariant; prompt: string }>;
  model?: string;
}

/**
 * Plug-in point for identity vision.
 * The metadata adapter is the default. Network adapters must be constructed
 * with an explicit fetch implementation; this package does not call them.
 */
export interface VisionAdapter {
  readonly id: string;
  describe(input: VisionDescribeInput): Promise<VisionDescribeOutput>;
}

export interface ChatContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ChatCompletionRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: {
    model: string;
    temperature: number;
    max_tokens: number;
    messages: Array<{ role: "system" | "user"; content: string | ChatContentPart[] }>;
  };
}
