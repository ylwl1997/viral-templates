import { zodToJsonSchema } from "zod-to-json-schema";
import { adaptedPromptSetSchema } from "./adapted.js";
import { templatePackSchema } from "./pack.js";
import { visionRewriteSchema } from "./vision.js";

const options = { target: "jsonSchema7", $refStrategy: "none" } as const;

export const templatePackJsonSchema = zodToJsonSchema(templatePackSchema, {
  ...options,
  name: "TemplatePack",
});

export const adaptedPromptSetJsonSchema = zodToJsonSchema(adaptedPromptSetSchema, {
  ...options,
  name: "AdaptedPromptSet",
});

export const visionRewriteJsonSchema = zodToJsonSchema(visionRewriteSchema, {
  ...options,
  name: "VisionRewrite",
});
