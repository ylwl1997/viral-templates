import { z } from "zod";

export const boundPhraseSchema = z
  .object({
    from: z.string().min(1),
    to: z.string(),
  })
  .strict();

export const subjectLineSchema = z
  .object({
    roleId: z.string().min(1),
    /** Exact default identity phrase, including the `<Image N>` token. */
    authored: z.string().min(1),
    action: z.string().min(1),
    wardrobePhrase: z.string().min(1).optional(),
    boundPhrases: z.array(boundPhraseSchema).optional(),
  })
  .strict();

export const optionalSentenceSchema = z
  .object({
    roleId: z.string().min(1),
    /** Identity words without an article, for `The {identity} from {token}`. */
    identity: z.string().min(1),
    template: z.string().min(1),
  })
  .strict();

export const timedCueSchema = z
  .object({
    label: z.string().regex(/^\d+-\d+s$/),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
    opener: z.string(),
    subjects: z.array(subjectLineSchema).min(1),
    closer: z.string(),
    optionalSentences: z.array(optionalSentenceSchema).optional(),
    /** Frozen camera clause used when a beat is collapsed to one pet. */
    camera: z.string().min(1),
    anchor: z.string().min(1),
    singleAction: z.string().min(1),
  })
  .strict();

export const lockedLineSchema = z
  .object({
    roleId: z.string().min(1),
    position: z.string().min(1),
    identity: z.string().min(1),
    wardrobe: z.string().min(1),
    action: z.string().min(1),
  })
  .strict();

export const segmentScriptSchema = z
  .object({
    timedHeader: z.string().min(1),
    timedCues: z.array(timedCueSchema).min(1).max(6),
    timedFooter: z.string().min(1),
    lockedIntro: z.string().min(1),
    lockedLines: z.array(lockedLineSchema).min(1),
    lockedExclusion: z.string().min(1),
    lockedCamera: z.string().min(1),
    setting: z.string().min(1),
    styleAnchors: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type SubjectLine = z.infer<typeof subjectLineSchema>;
export type OptionalSentence = z.infer<typeof optionalSentenceSchema>;
export type TimedCueScript = z.infer<typeof timedCueSchema>;
export type LockedLine = z.infer<typeof lockedLineSchema>;
export type SegmentScript = z.infer<typeof segmentScriptSchema>;
