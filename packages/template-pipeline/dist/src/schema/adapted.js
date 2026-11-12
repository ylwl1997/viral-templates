import { z } from "zod";
import { AGNES_VIDEO_MODEL, MAPPING_POLICY_ID, PACK_SCHEMA_VERSION } from "../constants.js";
import { appearanceSchema } from "./appearance.js";
export const countClassSchema = z.enum(["single", "multi"]);
export const photoLayoutSchema = z.enum(["single", "solo-stills", "grouped", "mixed"]);
export const interactionSchema = z.enum([
    "single-performer",
    "ensemble-in-frame",
    "grouped-together",
]);
export const outputVariantSchema = z.enum([
    "timed-beats",
    "locked-segment",
    "single-performer",
]);
export const adaptedPromptSetSchema = z
    .object({
    schemaVersion: z.literal(PACK_SCHEMA_VERSION),
    packId: z.string().min(1),
    packVersion: z.string().min(1),
    mappingPolicy: z.literal(MAPPING_POLICY_ID),
    adaptation: z
        .object({
        adapter: z.string().min(1),
        requestedAdapter: z.string().min(1),
        model: z.string().min(1).optional(),
        failClosed: z.boolean(),
        usedModelText: z.boolean(),
        fallback: z.enum(["none", "deterministic", "pack-prompt"]),
        warnings: z.array(z.string()),
        petCount: z.number().int().nonnegative(),
        countClass: countClassSchema,
        photoLayout: photoLayoutSchema,
        interaction: interactionSchema,
        reasons: z.array(z.string()),
    })
        .strict(),
    roles: z.array(z
        .object({
        roleId: z.string().min(1),
        status: z.enum(["filled", "dropped"]),
        required: z.boolean(),
        packToken: z.string(),
        deliveryToken: z.string().nullable(),
        phrase: z.string().optional(),
        appearance: appearanceSchema.optional(),
        image: z
            .object({
            url: z.string().optional(),
            path: z.string().optional(),
            groupId: z.string().optional(),
        })
            .strict()
            .optional(),
    })
        .strict()),
    segments: z.array(z
        .object({
        id: z.string().min(1),
        startSec: z.number(),
        endSec: z.number(),
        durationSec: z.number(),
        promptSeconds: z.number().int(),
        variant: outputVariantSchema,
        derivedFrom: z.enum(["timed-beats", "locked-segment"]).optional(),
        prompt: z.string().min(1),
        droppedRoleIds: z.array(z.string()),
        keptRoleIds: z.array(z.string()),
        collapsed: z.boolean(),
    })
        .strict()),
    generationHints: z
        .object({
        model: z.literal(AGNES_VIDEO_MODEL),
        resolution: z.literal("720P"),
        aspectRatio: z.string().regex(/^\d+:\d+$/),
        imagesOnly: z.literal(true),
        mode: z.literal("reference"),
        seconds: z.array(z.string().regex(/^(?:[4-9]|1[0-2])$/)),
    })
        .strict(),
})
    .strict();
//# sourceMappingURL=adapted.js.map