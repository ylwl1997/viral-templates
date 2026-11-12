import { z } from "zod";
import { appearanceSchema } from "./appearance.js";
import { countClassSchema, interactionSchema, outputVariantSchema, photoLayoutSchema } from "./adapted.js";
/** Structured JSON the vision model must return. Free prose is rejected. */
export const visionRewriteSchema = z
    .object({
    appearances: z
        .array(z
        .object({
        roleId: z.string().min(1),
        appearance: appearanceSchema,
        phrase: z.string().min(1),
    })
        .strict())
        .min(1),
    petCount: z.number().int().positive(),
    countClass: countClassSchema,
    photoLayout: photoLayoutSchema,
    interaction: interactionSchema,
    segments: z
        .array(z
        .object({
        id: z.string().min(1),
        variant: outputVariantSchema,
        prompt: z.string().min(1),
    })
        .strict())
        .min(1),
})
    .strict();
//# sourceMappingURL=vision.js.map