import { z } from "zod";
export declare const appearanceSchema: z.ZodObject<{
    species: z.ZodOptional<z.ZodString>;
    breed: z.ZodOptional<z.ZodString>;
    colors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    markings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    eyes: z.ZodOptional<z.ZodString>;
    clothing: z.ZodOptional<z.ZodString>;
    /** Pets visible in this one photo. */
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
export type AppearanceFacts = z.infer<typeof appearanceSchema>;
export declare const customerImageSchema: z.ZodEffects<z.ZodObject<{
    roleId: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    /** Same groupId means those roles share one photo. */
    groupId: z.ZodOptional<z.ZodString>;
    appearance: z.ZodOptional<z.ZodObject<{
        species: z.ZodOptional<z.ZodString>;
        breed: z.ZodOptional<z.ZodString>;
        colors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        markings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        eyes: z.ZodOptional<z.ZodString>;
        clothing: z.ZodOptional<z.ZodString>;
        /** Pets visible in this one photo. */
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
}, "strict", z.ZodTypeAny, {
    roleId: string;
    path?: string | undefined;
    url?: string | undefined;
    label?: string | undefined;
    groupId?: string | undefined;
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
}, {
    roleId: string;
    path?: string | undefined;
    url?: string | undefined;
    label?: string | undefined;
    groupId?: string | undefined;
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
}>, {
    roleId: string;
    path?: string | undefined;
    url?: string | undefined;
    label?: string | undefined;
    groupId?: string | undefined;
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
}, {
    roleId: string;
    path?: string | undefined;
    url?: string | undefined;
    label?: string | undefined;
    groupId?: string | undefined;
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
}>;
export type CustomerImage = z.infer<typeof customerImageSchema>;
export declare const customerJobSchema: z.ZodUnion<[z.ZodArray<z.ZodEffects<z.ZodObject<{
    roleId: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    /** Same groupId means those roles share one photo. */
    groupId: z.ZodOptional<z.ZodString>;
    appearance: z.ZodOptional<z.ZodObject<{
        species: z.ZodOptional<z.ZodString>;
        breed: z.ZodOptional<z.ZodString>;
        colors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        markings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        eyes: z.ZodOptional<z.ZodString>;
        clothing: z.ZodOptional<z.ZodString>;
        /** Pets visible in this one photo. */
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
}, "strict", z.ZodTypeAny, {
    roleId: string;
    path?: string | undefined;
    url?: string | undefined;
    label?: string | undefined;
    groupId?: string | undefined;
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
}, {
    roleId: string;
    path?: string | undefined;
    url?: string | undefined;
    label?: string | undefined;
    groupId?: string | undefined;
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
}>, {
    roleId: string;
    path?: string | undefined;
    url?: string | undefined;
    label?: string | undefined;
    groupId?: string | undefined;
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
}, {
    roleId: string;
    path?: string | undefined;
    url?: string | undefined;
    label?: string | undefined;
    groupId?: string | undefined;
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
}>, "many">, z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    variant: z.ZodOptional<z.ZodEnum<["auto", "timed-beats", "locked-segment"]>>;
    images: z.ZodArray<z.ZodEffects<z.ZodObject<{
        roleId: z.ZodString;
        url: z.ZodOptional<z.ZodString>;
        path: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        /** Same groupId means those roles share one photo. */
        groupId: z.ZodOptional<z.ZodString>;
        appearance: z.ZodOptional<z.ZodObject<{
            species: z.ZodOptional<z.ZodString>;
            breed: z.ZodOptional<z.ZodString>;
            colors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            markings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            eyes: z.ZodOptional<z.ZodString>;
            clothing: z.ZodOptional<z.ZodString>;
            /** Pets visible in this one photo. */
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
    }, "strict", z.ZodTypeAny, {
        roleId: string;
        path?: string | undefined;
        url?: string | undefined;
        label?: string | undefined;
        groupId?: string | undefined;
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
    }, {
        roleId: string;
        path?: string | undefined;
        url?: string | undefined;
        label?: string | undefined;
        groupId?: string | undefined;
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
    }>, {
        roleId: string;
        path?: string | undefined;
        url?: string | undefined;
        label?: string | undefined;
        groupId?: string | undefined;
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
    }, {
        roleId: string;
        path?: string | undefined;
        url?: string | undefined;
        label?: string | undefined;
        groupId?: string | undefined;
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
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    images: {
        roleId: string;
        path?: string | undefined;
        url?: string | undefined;
        label?: string | undefined;
        groupId?: string | undefined;
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
    }[];
    description?: string | undefined;
    variant?: "auto" | "timed-beats" | "locked-segment" | undefined;
}, {
    images: {
        roleId: string;
        path?: string | undefined;
        url?: string | undefined;
        label?: string | undefined;
        groupId?: string | undefined;
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
    }[];
    description?: string | undefined;
    variant?: "auto" | "timed-beats" | "locked-segment" | undefined;
}>]>;
export type CustomerJob = z.infer<typeof customerJobSchema>;
