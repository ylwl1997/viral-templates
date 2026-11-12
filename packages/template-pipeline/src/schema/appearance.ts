import { z } from "zod";

export const appearanceSchema = z
  .object({
    species: z.string().min(1).optional(),
    breed: z.string().min(1).optional(),
    colors: z.array(z.string().min(1)).optional(),
    markings: z.array(z.string().min(1)).optional(),
    eyes: z.string().min(1).optional(),
    clothing: z.string().min(1).optional(),
    /** Pets visible in this one photo. */
    count: z.number().int().positive().optional(),
    notes: z.string().optional(),
  })
  .strict();

export type AppearanceFacts = z.infer<typeof appearanceSchema>;

export const customerImageSchema = z
  .object({
    roleId: z.string().min(1),
    url: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    /** Same groupId means those roles share one photo. */
    groupId: z.string().min(1).optional(),
    appearance: appearanceSchema.optional(),
  })
  .strict()
  .refine((image) => Boolean(image.url || image.path), {
    message: "Each customer image needs a url or a local path.",
  });

export type CustomerImage = z.infer<typeof customerImageSchema>;

export const customerJobSchema = z.union([
  z.array(customerImageSchema).min(1),
  z
    .object({
      description: z.string().optional(),
      variant: z.enum(["auto", "timed-beats", "locked-segment"]).optional(),
      images: z.array(customerImageSchema).min(1),
    })
    .strict(),
]);

export type CustomerJob = z.infer<typeof customerJobSchema>;
