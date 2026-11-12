import { z } from "zod";
import { AGNES_VIDEO_MODEL, PACK_SCHEMA_VERSION } from "../constants.js";
import { segmentScriptSchema } from "./script.js";
export const roleSchema = z
    .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    label: z.string().min(1),
    required: z.boolean(),
    position: z.string().min(1),
    appearanceHints: z.string().min(1),
    wardrobe: z.string(),
    promptToken: z.string().regex(/^<Image \d+>$/),
    staleTerms: z.array(z.string().min(1)).default([]),
})
    .strict();
export const storyBeatSchema = z
    .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
    summary: z.string().min(1),
})
    .strict();
export const variantPromptsSchema = z
    .object({
    "timed-beats": z.string().min(1),
    "locked-segment": z.string().min(1),
})
    .strict();
export const generationSegmentSchema = z
    .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
    durationSec: z.number().min(4).max(12),
    promptSeconds: z.number().int().min(4).max(12),
    beatIds: z.array(z.string().min(1)).min(1),
    variantPrompts: variantPromptsSchema,
    script: segmentScriptSchema,
})
    .strict();
export const templatePackSchema = z
    .object({
    schemaVersion: z.literal(PACK_SCHEMA_VERSION),
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    aspectRatio: z.string().regex(/^\d+:\d+$/),
    sourceDurationSec: z.number().positive(),
    notes: z.string(),
    styleLine: z.string().min(1),
    templateAnimalTerms: z.array(z.string().min(1)).default([]),
    roles: z.array(roleSchema).min(1),
    storyBeats: z.array(storyBeatSchema).min(1),
    generationSegments: z.array(generationSegmentSchema).min(1),
    providerHints: z
        .object({
        defaultModel: z.literal(AGNES_VIDEO_MODEL),
        resolution: z.literal("720P"),
        imagesOnly: z.literal(true),
        mode: z.literal("reference"),
    })
        .strict(),
    provenance: z
        .object({
        boundaries: z.enum(["hypit", "ffmpeg", "manual"]),
        shotBoundariesSec: z.array(z.number().nonnegative()),
        detail: z.string(),
        segmentStrategy: z.string().min(1),
    })
        .strict(),
})
    .strict();
//# sourceMappingURL=pack.js.map