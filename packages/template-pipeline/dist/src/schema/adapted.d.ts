import { z } from "zod";
export declare const countClassSchema: z.ZodEnum<["single", "multi"]>;
export declare const photoLayoutSchema: z.ZodEnum<["single", "solo-stills", "grouped", "mixed"]>;
export declare const interactionSchema: z.ZodEnum<["single-performer", "ensemble-in-frame", "grouped-together"]>;
export declare const outputVariantSchema: z.ZodEnum<["timed-beats", "locked-segment", "single-performer"]>;
export declare const adaptedPromptSetSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"1.0.0">;
    packId: z.ZodString;
    packVersion: z.ZodString;
    mappingPolicy: z.ZodLiteral<"drop-unfilled">;
    adaptation: z.ZodObject<{
        adapter: z.ZodString;
        requestedAdapter: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        failClosed: z.ZodBoolean;
        usedModelText: z.ZodBoolean;
        fallback: z.ZodEnum<["none", "deterministic", "pack-prompt"]>;
        warnings: z.ZodArray<z.ZodString, "many">;
        petCount: z.ZodNumber;
        countClass: z.ZodEnum<["single", "multi"]>;
        photoLayout: z.ZodEnum<["single", "solo-stills", "grouped", "mixed"]>;
        interaction: z.ZodEnum<["single-performer", "ensemble-in-frame", "grouped-together"]>;
        reasons: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        adapter: string;
        requestedAdapter: string;
        failClosed: boolean;
        usedModelText: boolean;
        fallback: "none" | "deterministic" | "pack-prompt";
        warnings: string[];
        petCount: number;
        countClass: "single" | "multi";
        photoLayout: "single" | "solo-stills" | "grouped" | "mixed";
        interaction: "single-performer" | "ensemble-in-frame" | "grouped-together";
        reasons: string[];
        model?: string | undefined;
    }, {
        adapter: string;
        requestedAdapter: string;
        failClosed: boolean;
        usedModelText: boolean;
        fallback: "none" | "deterministic" | "pack-prompt";
        warnings: string[];
        petCount: number;
        countClass: "single" | "multi";
        photoLayout: "single" | "solo-stills" | "grouped" | "mixed";
        interaction: "single-performer" | "ensemble-in-frame" | "grouped-together";
        reasons: string[];
        model?: string | undefined;
    }>;
    roles: z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        status: z.ZodEnum<["filled", "dropped"]>;
        required: z.ZodBoolean;
        packToken: z.ZodString;
        deliveryToken: z.ZodNullable<z.ZodString>;
        phrase: z.ZodOptional<z.ZodString>;
        appearance: z.ZodOptional<z.ZodObject<{
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
        }>>;
        image: z.ZodOptional<z.ZodObject<{
            url: z.ZodOptional<z.ZodString>;
            path: z.ZodOptional<z.ZodString>;
            groupId: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            path?: string | undefined;
            url?: string | undefined;
            groupId?: string | undefined;
        }, {
            path?: string | undefined;
            url?: string | undefined;
            groupId?: string | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        status: "filled" | "dropped";
        roleId: string;
        required: boolean;
        packToken: string;
        deliveryToken: string | null;
        appearance?: {
            species?: string | undefined;
            breed?: string | undefined;
            colors?: string[] | undefined;
            markings?: string[] | undefined;
            eyes?: string | undefined;
            clothing?: string | undefined;
            count?: number | undefined;
            notes?: string | undefined;
        } | undefined;
        phrase?: string | undefined;
        image?: {
            path?: string | undefined;
            url?: string | undefined;
            groupId?: string | undefined;
        } | undefined;
    }, {
        status: "filled" | "dropped";
        roleId: string;
        required: boolean;
        packToken: string;
        deliveryToken: string | null;
        appearance?: {
            species?: string | undefined;
            breed?: string | undefined;
            colors?: string[] | undefined;
            markings?: string[] | undefined;
            eyes?: string | undefined;
            clothing?: string | undefined;
            count?: number | undefined;
            notes?: string | undefined;
        } | undefined;
        phrase?: string | undefined;
        image?: {
            path?: string | undefined;
            url?: string | undefined;
            groupId?: string | undefined;
        } | undefined;
    }>, "many">;
    segments: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        startSec: z.ZodNumber;
        endSec: z.ZodNumber;
        durationSec: z.ZodNumber;
        promptSeconds: z.ZodNumber;
        variant: z.ZodEnum<["timed-beats", "locked-segment", "single-performer"]>;
        derivedFrom: z.ZodOptional<z.ZodEnum<["timed-beats", "locked-segment"]>>;
        prompt: z.ZodString;
        droppedRoleIds: z.ZodArray<z.ZodString, "many">;
        keptRoleIds: z.ZodArray<z.ZodString, "many">;
        collapsed: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        variant: "timed-beats" | "locked-segment" | "single-performer";
        id: string;
        startSec: number;
        endSec: number;
        durationSec: number;
        promptSeconds: number;
        prompt: string;
        droppedRoleIds: string[];
        keptRoleIds: string[];
        collapsed: boolean;
        derivedFrom?: "timed-beats" | "locked-segment" | undefined;
    }, {
        variant: "timed-beats" | "locked-segment" | "single-performer";
        id: string;
        startSec: number;
        endSec: number;
        durationSec: number;
        promptSeconds: number;
        prompt: string;
        droppedRoleIds: string[];
        keptRoleIds: string[];
        collapsed: boolean;
        derivedFrom?: "timed-beats" | "locked-segment" | undefined;
    }>, "many">;
    generationHints: z.ZodObject<{
        model: z.ZodLiteral<"agnes-video-2.5">;
        resolution: z.ZodLiteral<"720P">;
        aspectRatio: z.ZodString;
        imagesOnly: z.ZodLiteral<true>;
        mode: z.ZodLiteral<"reference">;
        seconds: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        model: "agnes-video-2.5";
        resolution: "720P";
        aspectRatio: string;
        imagesOnly: true;
        mode: "reference";
        seconds: string[];
    }, {
        model: "agnes-video-2.5";
        resolution: "720P";
        aspectRatio: string;
        imagesOnly: true;
        mode: "reference";
        seconds: string[];
    }>;
}, "strict", z.ZodTypeAny, {
    schemaVersion: "1.0.0";
    packId: string;
    packVersion: string;
    mappingPolicy: "drop-unfilled";
    adaptation: {
        adapter: string;
        requestedAdapter: string;
        failClosed: boolean;
        usedModelText: boolean;
        fallback: "none" | "deterministic" | "pack-prompt";
        warnings: string[];
        petCount: number;
        countClass: "single" | "multi";
        photoLayout: "single" | "solo-stills" | "grouped" | "mixed";
        interaction: "single-performer" | "ensemble-in-frame" | "grouped-together";
        reasons: string[];
        model?: string | undefined;
    };
    roles: {
        status: "filled" | "dropped";
        roleId: string;
        required: boolean;
        packToken: string;
        deliveryToken: string | null;
        appearance?: {
            species?: string | undefined;
            breed?: string | undefined;
            colors?: string[] | undefined;
            markings?: string[] | undefined;
            eyes?: string | undefined;
            clothing?: string | undefined;
            count?: number | undefined;
            notes?: string | undefined;
        } | undefined;
        phrase?: string | undefined;
        image?: {
            path?: string | undefined;
            url?: string | undefined;
            groupId?: string | undefined;
        } | undefined;
    }[];
    segments: {
        variant: "timed-beats" | "locked-segment" | "single-performer";
        id: string;
        startSec: number;
        endSec: number;
        durationSec: number;
        promptSeconds: number;
        prompt: string;
        droppedRoleIds: string[];
        keptRoleIds: string[];
        collapsed: boolean;
        derivedFrom?: "timed-beats" | "locked-segment" | undefined;
    }[];
    generationHints: {
        model: "agnes-video-2.5";
        resolution: "720P";
        aspectRatio: string;
        imagesOnly: true;
        mode: "reference";
        seconds: string[];
    };
}, {
    schemaVersion: "1.0.0";
    packId: string;
    packVersion: string;
    mappingPolicy: "drop-unfilled";
    adaptation: {
        adapter: string;
        requestedAdapter: string;
        failClosed: boolean;
        usedModelText: boolean;
        fallback: "none" | "deterministic" | "pack-prompt";
        warnings: string[];
        petCount: number;
        countClass: "single" | "multi";
        photoLayout: "single" | "solo-stills" | "grouped" | "mixed";
        interaction: "single-performer" | "ensemble-in-frame" | "grouped-together";
        reasons: string[];
        model?: string | undefined;
    };
    roles: {
        status: "filled" | "dropped";
        roleId: string;
        required: boolean;
        packToken: string;
        deliveryToken: string | null;
        appearance?: {
            species?: string | undefined;
            breed?: string | undefined;
            colors?: string[] | undefined;
            markings?: string[] | undefined;
            eyes?: string | undefined;
            clothing?: string | undefined;
            count?: number | undefined;
            notes?: string | undefined;
        } | undefined;
        phrase?: string | undefined;
        image?: {
            path?: string | undefined;
            url?: string | undefined;
            groupId?: string | undefined;
        } | undefined;
    }[];
    segments: {
        variant: "timed-beats" | "locked-segment" | "single-performer";
        id: string;
        startSec: number;
        endSec: number;
        durationSec: number;
        promptSeconds: number;
        prompt: string;
        droppedRoleIds: string[];
        keptRoleIds: string[];
        collapsed: boolean;
        derivedFrom?: "timed-beats" | "locked-segment" | undefined;
    }[];
    generationHints: {
        model: "agnes-video-2.5";
        resolution: "720P";
        aspectRatio: string;
        imagesOnly: true;
        mode: "reference";
        seconds: string[];
    };
}>;
export type AdaptedPromptSet = z.infer<typeof adaptedPromptSetSchema>;
export type CountClass = z.infer<typeof countClassSchema>;
export type PhotoLayout = z.infer<typeof photoLayoutSchema>;
export type InteractionKind = z.infer<typeof interactionSchema>;
export type OutputVariant = z.infer<typeof outputVariantSchema>;
