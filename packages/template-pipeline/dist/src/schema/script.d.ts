import { z } from "zod";
export declare const boundPhraseSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
}, "strict", z.ZodTypeAny, {
    from: string;
    to: string;
}, {
    from: string;
    to: string;
}>;
export declare const subjectLineSchema: z.ZodObject<{
    roleId: z.ZodString;
    /** Exact default identity phrase, including the `<Image N>` token. */
    authored: z.ZodString;
    action: z.ZodString;
    wardrobePhrase: z.ZodOptional<z.ZodString>;
    boundPhrases: z.ZodOptional<z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        from: string;
        to: string;
    }, {
        from: string;
        to: string;
    }>, "many">>;
}, "strict", z.ZodTypeAny, {
    roleId: string;
    authored: string;
    action: string;
    wardrobePhrase?: string | undefined;
    boundPhrases?: {
        from: string;
        to: string;
    }[] | undefined;
}, {
    roleId: string;
    authored: string;
    action: string;
    wardrobePhrase?: string | undefined;
    boundPhrases?: {
        from: string;
        to: string;
    }[] | undefined;
}>;
export declare const optionalSentenceSchema: z.ZodObject<{
    roleId: z.ZodString;
    /** Identity words without an article, for `The {identity} from {token}`. */
    identity: z.ZodString;
    template: z.ZodString;
}, "strict", z.ZodTypeAny, {
    roleId: string;
    identity: string;
    template: string;
}, {
    roleId: string;
    identity: string;
    template: string;
}>;
export declare const timedCueSchema: z.ZodObject<{
    label: z.ZodString;
    startSec: z.ZodNumber;
    endSec: z.ZodNumber;
    opener: z.ZodString;
    subjects: z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        /** Exact default identity phrase, including the `<Image N>` token. */
        authored: z.ZodString;
        action: z.ZodString;
        wardrobePhrase: z.ZodOptional<z.ZodString>;
        boundPhrases: z.ZodOptional<z.ZodArray<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            from: string;
            to: string;
        }, {
            from: string;
            to: string;
        }>, "many">>;
    }, "strict", z.ZodTypeAny, {
        roleId: string;
        authored: string;
        action: string;
        wardrobePhrase?: string | undefined;
        boundPhrases?: {
            from: string;
            to: string;
        }[] | undefined;
    }, {
        roleId: string;
        authored: string;
        action: string;
        wardrobePhrase?: string | undefined;
        boundPhrases?: {
            from: string;
            to: string;
        }[] | undefined;
    }>, "many">;
    closer: z.ZodString;
    optionalSentences: z.ZodOptional<z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        /** Identity words without an article, for `The {identity} from {token}`. */
        identity: z.ZodString;
        template: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        roleId: string;
        identity: string;
        template: string;
    }, {
        roleId: string;
        identity: string;
        template: string;
    }>, "many">>;
    /** Frozen camera clause used when a beat is collapsed to one pet. */
    camera: z.ZodString;
    anchor: z.ZodString;
    singleAction: z.ZodString;
}, "strict", z.ZodTypeAny, {
    label: string;
    startSec: number;
    endSec: number;
    opener: string;
    subjects: {
        roleId: string;
        authored: string;
        action: string;
        wardrobePhrase?: string | undefined;
        boundPhrases?: {
            from: string;
            to: string;
        }[] | undefined;
    }[];
    closer: string;
    camera: string;
    anchor: string;
    singleAction: string;
    optionalSentences?: {
        roleId: string;
        identity: string;
        template: string;
    }[] | undefined;
}, {
    label: string;
    startSec: number;
    endSec: number;
    opener: string;
    subjects: {
        roleId: string;
        authored: string;
        action: string;
        wardrobePhrase?: string | undefined;
        boundPhrases?: {
            from: string;
            to: string;
        }[] | undefined;
    }[];
    closer: string;
    camera: string;
    anchor: string;
    singleAction: string;
    optionalSentences?: {
        roleId: string;
        identity: string;
        template: string;
    }[] | undefined;
}>;
export declare const lockedLineSchema: z.ZodObject<{
    roleId: z.ZodString;
    position: z.ZodString;
    identity: z.ZodString;
    wardrobe: z.ZodString;
    action: z.ZodString;
}, "strict", z.ZodTypeAny, {
    roleId: string;
    action: string;
    identity: string;
    position: string;
    wardrobe: string;
}, {
    roleId: string;
    action: string;
    identity: string;
    position: string;
    wardrobe: string;
}>;
export declare const segmentScriptSchema: z.ZodObject<{
    timedHeader: z.ZodString;
    timedCues: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        startSec: z.ZodNumber;
        endSec: z.ZodNumber;
        opener: z.ZodString;
        subjects: z.ZodArray<z.ZodObject<{
            roleId: z.ZodString;
            /** Exact default identity phrase, including the `<Image N>` token. */
            authored: z.ZodString;
            action: z.ZodString;
            wardrobePhrase: z.ZodOptional<z.ZodString>;
            boundPhrases: z.ZodOptional<z.ZodArray<z.ZodObject<{
                from: z.ZodString;
                to: z.ZodString;
            }, "strict", z.ZodTypeAny, {
                from: string;
                to: string;
            }, {
                from: string;
                to: string;
            }>, "many">>;
        }, "strict", z.ZodTypeAny, {
            roleId: string;
            authored: string;
            action: string;
            wardrobePhrase?: string | undefined;
            boundPhrases?: {
                from: string;
                to: string;
            }[] | undefined;
        }, {
            roleId: string;
            authored: string;
            action: string;
            wardrobePhrase?: string | undefined;
            boundPhrases?: {
                from: string;
                to: string;
            }[] | undefined;
        }>, "many">;
        closer: z.ZodString;
        optionalSentences: z.ZodOptional<z.ZodArray<z.ZodObject<{
            roleId: z.ZodString;
            /** Identity words without an article, for `The {identity} from {token}`. */
            identity: z.ZodString;
            template: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            roleId: string;
            identity: string;
            template: string;
        }, {
            roleId: string;
            identity: string;
            template: string;
        }>, "many">>;
        /** Frozen camera clause used when a beat is collapsed to one pet. */
        camera: z.ZodString;
        anchor: z.ZodString;
        singleAction: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        label: string;
        startSec: number;
        endSec: number;
        opener: string;
        subjects: {
            roleId: string;
            authored: string;
            action: string;
            wardrobePhrase?: string | undefined;
            boundPhrases?: {
                from: string;
                to: string;
            }[] | undefined;
        }[];
        closer: string;
        camera: string;
        anchor: string;
        singleAction: string;
        optionalSentences?: {
            roleId: string;
            identity: string;
            template: string;
        }[] | undefined;
    }, {
        label: string;
        startSec: number;
        endSec: number;
        opener: string;
        subjects: {
            roleId: string;
            authored: string;
            action: string;
            wardrobePhrase?: string | undefined;
            boundPhrases?: {
                from: string;
                to: string;
            }[] | undefined;
        }[];
        closer: string;
        camera: string;
        anchor: string;
        singleAction: string;
        optionalSentences?: {
            roleId: string;
            identity: string;
            template: string;
        }[] | undefined;
    }>, "many">;
    timedFooter: z.ZodString;
    lockedIntro: z.ZodString;
    lockedLines: z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        position: z.ZodString;
        identity: z.ZodString;
        wardrobe: z.ZodString;
        action: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        roleId: string;
        action: string;
        identity: string;
        position: string;
        wardrobe: string;
    }, {
        roleId: string;
        action: string;
        identity: string;
        position: string;
        wardrobe: string;
    }>, "many">;
    lockedExclusion: z.ZodString;
    lockedCamera: z.ZodString;
    setting: z.ZodString;
    styleAnchors: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    timedHeader: string;
    timedCues: {
        label: string;
        startSec: number;
        endSec: number;
        opener: string;
        subjects: {
            roleId: string;
            authored: string;
            action: string;
            wardrobePhrase?: string | undefined;
            boundPhrases?: {
                from: string;
                to: string;
            }[] | undefined;
        }[];
        closer: string;
        camera: string;
        anchor: string;
        singleAction: string;
        optionalSentences?: {
            roleId: string;
            identity: string;
            template: string;
        }[] | undefined;
    }[];
    timedFooter: string;
    lockedIntro: string;
    lockedLines: {
        roleId: string;
        action: string;
        identity: string;
        position: string;
        wardrobe: string;
    }[];
    lockedExclusion: string;
    lockedCamera: string;
    setting: string;
    styleAnchors: string[];
}, {
    timedHeader: string;
    timedCues: {
        label: string;
        startSec: number;
        endSec: number;
        opener: string;
        subjects: {
            roleId: string;
            authored: string;
            action: string;
            wardrobePhrase?: string | undefined;
            boundPhrases?: {
                from: string;
                to: string;
            }[] | undefined;
        }[];
        closer: string;
        camera: string;
        anchor: string;
        singleAction: string;
        optionalSentences?: {
            roleId: string;
            identity: string;
            template: string;
        }[] | undefined;
    }[];
    timedFooter: string;
    lockedIntro: string;
    lockedLines: {
        roleId: string;
        action: string;
        identity: string;
        position: string;
        wardrobe: string;
    }[];
    lockedExclusion: string;
    lockedCamera: string;
    setting: string;
    styleAnchors: string[];
}>;
export type SubjectLine = z.infer<typeof subjectLineSchema>;
export type OptionalSentence = z.infer<typeof optionalSentenceSchema>;
export type TimedCueScript = z.infer<typeof timedCueSchema>;
export type LockedLine = z.infer<typeof lockedLineSchema>;
export type SegmentScript = z.infer<typeof segmentScriptSchema>;
