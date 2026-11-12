import { z } from "zod";
export declare const roleSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    required: z.ZodBoolean;
    position: z.ZodString;
    appearanceHints: z.ZodString;
    wardrobe: z.ZodString;
    promptToken: z.ZodString;
    staleTerms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    label: string;
    required: boolean;
    id: string;
    position: string;
    wardrobe: string;
    appearanceHints: string;
    promptToken: string;
    staleTerms: string[];
}, {
    label: string;
    required: boolean;
    id: string;
    position: string;
    wardrobe: string;
    appearanceHints: string;
    promptToken: string;
    staleTerms?: string[] | undefined;
}>;
export declare const storyBeatSchema: z.ZodObject<{
    id: z.ZodString;
    startSec: z.ZodNumber;
    endSec: z.ZodNumber;
    summary: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: string;
    startSec: number;
    endSec: number;
    summary: string;
}, {
    id: string;
    startSec: number;
    endSec: number;
    summary: string;
}>;
export declare const variantPromptsSchema: z.ZodObject<{
    "timed-beats": z.ZodString;
    "locked-segment": z.ZodString;
}, "strict", z.ZodTypeAny, {
    "timed-beats": string;
    "locked-segment": string;
}, {
    "timed-beats": string;
    "locked-segment": string;
}>;
export declare const generationSegmentSchema: z.ZodObject<{
    id: z.ZodString;
    startSec: z.ZodNumber;
    endSec: z.ZodNumber;
    durationSec: z.ZodNumber;
    promptSeconds: z.ZodNumber;
    beatIds: z.ZodArray<z.ZodString, "many">;
    variantPrompts: z.ZodObject<{
        "timed-beats": z.ZodString;
        "locked-segment": z.ZodString;
    }, "strict", z.ZodTypeAny, {
        "timed-beats": string;
        "locked-segment": string;
    }, {
        "timed-beats": string;
        "locked-segment": string;
    }>;
    script: z.ZodObject<{
        timedHeader: z.ZodString;
        timedCues: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            startSec: z.ZodNumber;
            endSec: z.ZodNumber;
            opener: z.ZodString;
            subjects: z.ZodArray<z.ZodObject<{
                roleId: z.ZodString;
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
}, "strict", z.ZodTypeAny, {
    id: string;
    startSec: number;
    endSec: number;
    durationSec: number;
    promptSeconds: number;
    beatIds: string[];
    variantPrompts: {
        "timed-beats": string;
        "locked-segment": string;
    };
    script: {
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
    };
}, {
    id: string;
    startSec: number;
    endSec: number;
    durationSec: number;
    promptSeconds: number;
    beatIds: string[];
    variantPrompts: {
        "timed-beats": string;
        "locked-segment": string;
    };
    script: {
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
    };
}>;
export declare const templatePackSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"1.0.0">;
    id: z.ZodString;
    title: z.ZodString;
    version: z.ZodString;
    aspectRatio: z.ZodString;
    sourceDurationSec: z.ZodNumber;
    notes: z.ZodString;
    styleLine: z.ZodString;
    templateAnimalTerms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    roles: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        required: z.ZodBoolean;
        position: z.ZodString;
        appearanceHints: z.ZodString;
        wardrobe: z.ZodString;
        promptToken: z.ZodString;
        staleTerms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strict", z.ZodTypeAny, {
        label: string;
        required: boolean;
        id: string;
        position: string;
        wardrobe: string;
        appearanceHints: string;
        promptToken: string;
        staleTerms: string[];
    }, {
        label: string;
        required: boolean;
        id: string;
        position: string;
        wardrobe: string;
        appearanceHints: string;
        promptToken: string;
        staleTerms?: string[] | undefined;
    }>, "many">;
    storyBeats: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        startSec: z.ZodNumber;
        endSec: z.ZodNumber;
        summary: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        startSec: number;
        endSec: number;
        summary: string;
    }, {
        id: string;
        startSec: number;
        endSec: number;
        summary: string;
    }>, "many">;
    generationSegments: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        startSec: z.ZodNumber;
        endSec: z.ZodNumber;
        durationSec: z.ZodNumber;
        promptSeconds: z.ZodNumber;
        beatIds: z.ZodArray<z.ZodString, "many">;
        variantPrompts: z.ZodObject<{
            "timed-beats": z.ZodString;
            "locked-segment": z.ZodString;
        }, "strict", z.ZodTypeAny, {
            "timed-beats": string;
            "locked-segment": string;
        }, {
            "timed-beats": string;
            "locked-segment": string;
        }>;
        script: z.ZodObject<{
            timedHeader: z.ZodString;
            timedCues: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                startSec: z.ZodNumber;
                endSec: z.ZodNumber;
                opener: z.ZodString;
                subjects: z.ZodArray<z.ZodObject<{
                    roleId: z.ZodString;
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
    }, "strict", z.ZodTypeAny, {
        id: string;
        startSec: number;
        endSec: number;
        durationSec: number;
        promptSeconds: number;
        beatIds: string[];
        variantPrompts: {
            "timed-beats": string;
            "locked-segment": string;
        };
        script: {
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
        };
    }, {
        id: string;
        startSec: number;
        endSec: number;
        durationSec: number;
        promptSeconds: number;
        beatIds: string[];
        variantPrompts: {
            "timed-beats": string;
            "locked-segment": string;
        };
        script: {
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
        };
    }>, "many">;
    providerHints: z.ZodObject<{
        defaultModel: z.ZodLiteral<"agnes-video-2.5">;
        resolution: z.ZodLiteral<"720P">;
        imagesOnly: z.ZodLiteral<true>;
        mode: z.ZodLiteral<"reference">;
    }, "strict", z.ZodTypeAny, {
        resolution: "720P";
        imagesOnly: true;
        mode: "reference";
        defaultModel: "agnes-video-2.5";
    }, {
        resolution: "720P";
        imagesOnly: true;
        mode: "reference";
        defaultModel: "agnes-video-2.5";
    }>;
    provenance: z.ZodObject<{
        boundaries: z.ZodEnum<["hypit", "ffmpeg", "manual"]>;
        shotBoundariesSec: z.ZodArray<z.ZodNumber, "many">;
        detail: z.ZodString;
        segmentStrategy: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        boundaries: "hypit" | "ffmpeg" | "manual";
        shotBoundariesSec: number[];
        detail: string;
        segmentStrategy: string;
    }, {
        boundaries: "hypit" | "ffmpeg" | "manual";
        shotBoundariesSec: number[];
        detail: string;
        segmentStrategy: string;
    }>;
}, "strict", z.ZodTypeAny, {
    notes: string;
    schemaVersion: "1.0.0";
    roles: {
        label: string;
        required: boolean;
        id: string;
        position: string;
        wardrobe: string;
        appearanceHints: string;
        promptToken: string;
        staleTerms: string[];
    }[];
    id: string;
    aspectRatio: string;
    title: string;
    version: string;
    sourceDurationSec: number;
    styleLine: string;
    templateAnimalTerms: string[];
    storyBeats: {
        id: string;
        startSec: number;
        endSec: number;
        summary: string;
    }[];
    generationSegments: {
        id: string;
        startSec: number;
        endSec: number;
        durationSec: number;
        promptSeconds: number;
        beatIds: string[];
        variantPrompts: {
            "timed-beats": string;
            "locked-segment": string;
        };
        script: {
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
        };
    }[];
    providerHints: {
        resolution: "720P";
        imagesOnly: true;
        mode: "reference";
        defaultModel: "agnes-video-2.5";
    };
    provenance: {
        boundaries: "hypit" | "ffmpeg" | "manual";
        shotBoundariesSec: number[];
        detail: string;
        segmentStrategy: string;
    };
}, {
    notes: string;
    schemaVersion: "1.0.0";
    roles: {
        label: string;
        required: boolean;
        id: string;
        position: string;
        wardrobe: string;
        appearanceHints: string;
        promptToken: string;
        staleTerms?: string[] | undefined;
    }[];
    id: string;
    aspectRatio: string;
    title: string;
    version: string;
    sourceDurationSec: number;
    styleLine: string;
    storyBeats: {
        id: string;
        startSec: number;
        endSec: number;
        summary: string;
    }[];
    generationSegments: {
        id: string;
        startSec: number;
        endSec: number;
        durationSec: number;
        promptSeconds: number;
        beatIds: string[];
        variantPrompts: {
            "timed-beats": string;
            "locked-segment": string;
        };
        script: {
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
        };
    }[];
    providerHints: {
        resolution: "720P";
        imagesOnly: true;
        mode: "reference";
        defaultModel: "agnes-video-2.5";
    };
    provenance: {
        boundaries: "hypit" | "ffmpeg" | "manual";
        shotBoundariesSec: number[];
        detail: string;
        segmentStrategy: string;
    };
    templateAnimalTerms?: string[] | undefined;
}>;
export type Role = z.infer<typeof roleSchema>;
export type StoryBeat = z.infer<typeof storyBeatSchema>;
export type GenerationSegment = z.infer<typeof generationSegmentSchema>;
export type TemplatePack = z.infer<typeof templatePackSchema>;
export type PromptVariant = "timed-beats" | "locked-segment";
