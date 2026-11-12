import { z } from "zod";
/** Structured JSON the vision model must return. Free prose is rejected. */
export declare const visionRewriteSchema: z.ZodObject<{
    appearances: z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        appearance: z.ZodObject<{
            species: z.ZodOptional<z.ZodString>;
            breed: z.ZodOptional<z.ZodString>;
            colors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            markings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            eyes: z.ZodOptional<z.ZodString>;
            clothing: z.ZodOptional<z.ZodString>;
            count: z.ZodOptional<z.ZodNumber>;
            notes: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            species?: string | undefined;
            breed?: string | undefined;
            colors?: string[] | undefined;
            markings?: string[] | undefined;
            eyes?: string | undefined;
            clothing?: string | undefined;
            count?: number | undefined;
            notes?: string | undefined;
        }, {
            species?: string | undefined;
            breed?: string | undefined;
            colors?: string[] | undefined;
            markings?: string[] | undefined;
            eyes?: string | undefined;
            clothing?: string | undefined;
            count?: number | undefined;
            notes?: string | undefined;
        }>;
        phrase: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        roleId: string;
        appearance: {
            species?: string | undefined;
            breed?: string | undefined;
            colors?: string[] | undefined;
            markings?: string[] | undefined;
            eyes?: string | undefined;
            clothing?: string | undefined;
            count?: number | undefined;
            notes?: string | undefined;
        };
        phrase: string;
    }, {
        roleId: string;
        appearance: {
            species?: string | undefined;
            breed?: string | undefined;
            colors?: string[] | undefined;
            markings?: string[] | undefined;
            eyes?: string | undefined;
            clothing?: string | undefined;
            count?: number | undefined;
            notes?: string | undefined;
        };
        phrase: string;
    }>, "many">;
    petCount: z.ZodNumber;
    countClass: z.ZodEnum<["single", "multi"]>;
    photoLayout: z.ZodEnum<["single", "solo-stills", "grouped", "mixed"]>;
    interaction: z.ZodEnum<["single-performer", "ensemble-in-frame", "grouped-together"]>;
    segments: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        variant: z.ZodEnum<["timed-beats", "locked-segment", "single-performer"]>;
        prompt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        variant: "timed-beats" | "locked-segment" | "single-performer";
        id: string;
        prompt: string;
    }, {
        variant: "timed-beats" | "locked-segment" | "single-performer";
        id: string;
        prompt: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    petCount: number;
    countClass: "single" | "multi";
    photoLayout: "single" | "solo-stills" | "grouped" | "mixed";
    interaction: "single-performer" | "ensemble-in-frame" | "grouped-together";
    segments: {
        variant: "timed-beats" | "locked-segment" | "single-performer";
        id: string;
        prompt: string;
    }[];
    appearances: {
        roleId: string;
        appearance: {
            species?: string | undefined;
            breed?: string | undefined;
            colors?: string[] | undefined;
            markings?: string[] | undefined;
            eyes?: string | undefined;
            clothing?: string | undefined;
            count?: number | undefined;
            notes?: string | undefined;
        };
        phrase: string;
    }[];
}, {
    petCount: number;
    countClass: "single" | "multi";
    photoLayout: "single" | "solo-stills" | "grouped" | "mixed";
    interaction: "single-performer" | "ensemble-in-frame" | "grouped-together";
    segments: {
        variant: "timed-beats" | "locked-segment" | "single-performer";
        id: string;
        prompt: string;
    }[];
    appearances: {
        roleId: string;
        appearance: {
            species?: string | undefined;
            breed?: string | undefined;
            colors?: string[] | undefined;
            markings?: string[] | undefined;
            eyes?: string | undefined;
            clothing?: string | undefined;
            count?: number | undefined;
            notes?: string | undefined;
        };
        phrase: string;
    }[];
}>;
export type VisionRewrite = z.infer<typeof visionRewriteSchema>;
