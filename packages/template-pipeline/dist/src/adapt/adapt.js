import { MAPPING_POLICY_ID, PACK_SCHEMA_VERSION } from "../constants.js";
import { StaleIdentityError, VisionOutputRejectedError } from "../errors.js";
import { chooseVariant, classifyCast, parseVariantRequest, resolveImages } from "../prompt/classify.js";
import { assertPromptFrozen } from "../prompt/freeze.js";
import { renderAdaptedLocked, renderAdaptedTimed, renderSingleLocked, renderSingleTimed, } from "../prompt/render.js";
import { findStaleTerms } from "../prompt/stale.js";
import { clothingReplacement } from "../prompt/appearance.js";
import { parseAdaptedPromptSet, parseTemplatePack } from "../pack/validate.js";
import { MetadataVisionAdapter } from "../vision/metadata.js";
export async function adaptPack(packInput, images, options = {}) {
    const pack = parseTemplatePack(packInput);
    const resolved = resolveImages(pack, images);
    const classification = classifyCast(resolved);
    const requested = options.variant ?? "auto";
    const adapter = options.adapter ?? new MetadataVisionAdapter();
    const deterministic = buildDeterministic(pack, resolved, classification, requested, adapter.id);
    if (adapter.id === "metadata")
        return deterministic;
    try {
        const described = await adapter.describe({
            pack,
            images: resolved,
            filledRoleIds: resolved.map((image) => image.roleId),
            unfilledRoleIds: pack.roles.filter((role) => !resolved.some((image) => image.roleId === role.id)).map((role) => role.id),
        });
        const accepted = acceptModelRewrite(pack, resolved, described, classification, adapter.id);
        if (accepted)
            return accepted;
        throw new VisionOutputRejectedError("Vision adapter returned no segment prompts.");
    }
    catch (error) {
        if (!(error instanceof VisionOutputRejectedError) || options.failClosed === false)
            throw error;
        return {
            ...deterministic,
            adaptation: {
                ...deterministic.adaptation,
                requestedAdapter: adapter.id,
                failClosed: true,
                usedModelText: false,
                fallback: "deterministic",
                warnings: [
                    ...deterministic.adaptation.warnings,
                    `Vision output was rejected (${error.message}). Model prose was discarded. The deterministic rewrite was kept.`,
                ],
            },
        };
    }
}
export function parseCustomerImages(input) {
    if (Array.isArray(input))
        return { images: input };
    if (input && typeof input === "object" && "images" in input) {
        const record = input;
        return {
            images: record.images,
            variant: record.variant ? parseVariantRequest(record.variant) : undefined,
        };
    }
    throw new VisionOutputRejectedError("Image file must be an array or an object with an images array.");
}
function buildDeterministic(pack, images, classification, requested, adapterId) {
    const pets = petMap(pack, images);
    const filled = new Set(images.map((image) => image.roleId));
    const primaryRoleId = pack.roles.find((role) => role.required && filled.has(role.id))?.id ?? images[0]?.roleId ?? "";
    const ctx = { filled, pets, primaryRoleId, interaction: classification.interaction };
    const droppedRoleIds = pack.roles.filter((role) => !filled.has(role.id)).map((role) => role.id);
    const keptRoleIds = images.map((image) => image.roleId);
    const allowed = [...pets.values()].map((pet) => `${pet.phrase} ${pet.clothing ?? ""} ${pet.wardrobe}`).join(" ");
    const segments = pack.generationSegments.map((segment) => {
        const choice = chooseVariant(segment, classification, requested);
        const prompt = renderSegment(pack, segment, ctx, choice.variant, choice.derivedFrom);
        const stale = findStaleTerms(prompt, pack, allowed);
        if (stale.length)
            throw new StaleIdentityError(stale);
        assertPromptFrozen(pack, segment, choice.variant, choice.derivedFrom, prompt);
        return {
            id: segment.id,
            startSec: segment.startSec,
            endSec: segment.endSec,
            durationSec: segment.durationSec,
            promptSeconds: segment.promptSeconds,
            variant: choice.variant,
            ...(choice.derivedFrom ? { derivedFrom: choice.derivedFrom } : {}),
            prompt,
            droppedRoleIds,
            keptRoleIds,
            collapsed: choice.variant === "single-performer",
        };
    });
    const warnings = publicUrlWarnings(images);
    if (droppedRoleIds.length) {
        warnings.push(`Dropped unfilled roles: ${droppedRoleIds.join(", ")}. Pack-default animals were not substituted.`);
    }
    if (classification.interaction === "single-performer") {
        warnings.push("Collapsed to a single performer. Shot time codes and camera anchors stay; other animals are not invented.");
    }
    return parseAdaptedPromptSet({
        schemaVersion: PACK_SCHEMA_VERSION,
        packId: pack.id,
        packVersion: pack.version,
        mappingPolicy: MAPPING_POLICY_ID,
        adaptation: {
            adapter: "metadata",
            requestedAdapter: adapterId,
            failClosed: true,
            usedModelText: false,
            fallback: "none",
            warnings,
            petCount: classification.petCount,
            countClass: classification.countClass,
            photoLayout: classification.photoLayout,
            interaction: classification.interaction,
            reasons: classification.reasons,
        },
        roles: pack.roles.map((role) => {
            const image = images.find((item) => item.roleId === role.id);
            return {
                roleId: role.id,
                status: image ? "filled" : "dropped",
                required: role.required,
                packToken: role.promptToken,
                deliveryToken: image?.deliveryToken ?? null,
                ...(image
                    ? {
                        phrase: image.phrase,
                        ...(image.appearance ? { appearance: image.appearance } : {}),
                        image: {
                            ...(image.url ? { url: image.url } : {}),
                            ...(image.path ? { path: image.path } : {}),
                            ...(image.groupId ? { groupId: image.groupId } : {}),
                        },
                    }
                    : {}),
            };
        }),
        segments,
        generationHints: {
            model: pack.providerHints.defaultModel,
            resolution: pack.providerHints.resolution,
            aspectRatio: pack.aspectRatio,
            imagesOnly: true,
            mode: "reference",
            seconds: segments.map((segment) => String(segment.promptSeconds)),
        },
    });
}
function acceptModelRewrite(pack, images, described, fallbackClassification, adapterId) {
    if (!described.segments?.length)
        return undefined;
    const byId = new Map(described.segments.map((segment) => [segment.id, segment]));
    if (pack.generationSegments.some((segment) => !byId.has(segment.id))) {
        throw new VisionOutputRejectedError("Vision output missed a generation segment.");
    }
    const droppedTokens = pack.roles
        .filter((role) => !images.some((image) => image.roleId === role.id))
        .map((role) => role.promptToken);
    const allowed = [
        ...images.map((image) => image.phrase),
        ...(described.appearances ?? []).map((item) => item.phrase),
    ].join(" ");
    const segments = pack.generationSegments.map((segment) => {
        const modelSegment = byId.get(segment.id);
        const prompt = retoken(modelSegment.prompt, images);
        for (const token of droppedTokens) {
            if (prompt.includes(token)) {
                throw new VisionOutputRejectedError(`Vision prompt kept dropped token ${token}.`);
            }
        }
        const derivedFrom = inferDerived(segment, modelSegment.variant, prompt);
        assertPromptFrozen(pack, segment, modelSegment.variant, derivedFrom, prompt);
        const stale = findStaleTerms(prompt, pack, allowed);
        if (stale.length) {
            throw new VisionOutputRejectedError(`Vision prompt kept template identity terms: ${stale.join(", ")}.`);
        }
        return {
            id: segment.id,
            startSec: segment.startSec,
            endSec: segment.endSec,
            durationSec: segment.durationSec,
            promptSeconds: segment.promptSeconds,
            variant: modelSegment.variant,
            ...(derivedFrom ? { derivedFrom } : {}),
            prompt,
            droppedRoleIds: pack.roles.filter((role) => !images.some((image) => image.roleId === role.id)).map((role) => role.id),
            keptRoleIds: images.map((image) => image.roleId),
            collapsed: modelSegment.variant === "single-performer",
        };
    });
    const classification = {
        petCount: described.petCount ?? fallbackClassification.petCount,
        countClass: described.countClass ?? fallbackClassification.countClass,
        photoLayout: described.photoLayout ?? fallbackClassification.photoLayout,
        interaction: described.interaction ?? fallbackClassification.interaction,
        reasons: ["Classification and prompts came from the vision adapter and passed schema and freeze checks."],
    };
    return parseAdaptedPromptSet({
        schemaVersion: PACK_SCHEMA_VERSION,
        packId: pack.id,
        packVersion: pack.version,
        mappingPolicy: MAPPING_POLICY_ID,
        adaptation: {
            adapter: adapterId,
            requestedAdapter: adapterId,
            ...(described.model ? { model: described.model } : {}),
            failClosed: true,
            usedModelText: true,
            fallback: "none",
            warnings: publicUrlWarnings(images),
            petCount: classification.petCount,
            countClass: classification.countClass,
            photoLayout: classification.photoLayout,
            interaction: classification.interaction,
            reasons: classification.reasons,
        },
        roles: pack.roles.map((role) => {
            const image = images.find((item) => item.roleId === role.id);
            const modelAppearance = described.appearances?.find((item) => item.roleId === role.id);
            return {
                roleId: role.id,
                status: image ? "filled" : "dropped",
                required: role.required,
                packToken: role.promptToken,
                deliveryToken: image?.deliveryToken ?? null,
                ...(image
                    ? {
                        phrase: modelAppearance?.phrase ?? image.phrase,
                        ...(modelAppearance?.appearance
                            ? { appearance: modelAppearance.appearance }
                            : image.appearance
                                ? { appearance: image.appearance }
                                : {}),
                        image: {
                            ...(image.url ? { url: image.url } : {}),
                            ...(image.path ? { path: image.path } : {}),
                            ...(image.groupId ? { groupId: image.groupId } : {}),
                        },
                    }
                    : {}),
            };
        }),
        segments,
        generationHints: {
            model: pack.providerHints.defaultModel,
            resolution: pack.providerHints.resolution,
            aspectRatio: pack.aspectRatio,
            imagesOnly: true,
            mode: "reference",
            seconds: segments.map((segment) => String(segment.promptSeconds)),
        },
    });
}
function renderSegment(pack, segment, ctx, variant, derivedFrom) {
    const pet = ctx.pets.get(ctx.primaryRoleId) ?? [...ctx.pets.values()][0];
    if (!pet)
        throw new StaleIdentityError(["missing-pet"]);
    if (variant === "single-performer" && derivedFrom === "locked-segment")
        return renderSingleLocked(pack, segment, pet);
    if (variant === "single-performer")
        return renderSingleTimed(pack, segment, pet);
    if (variant === "locked-segment")
        return renderAdaptedLocked(pack, segment, ctx);
    return renderAdaptedTimed(pack, segment, ctx);
}
function petMap(pack, images) {
    const pets = new Map();
    for (const image of images) {
        const role = pack.roles.find((item) => item.id === image.roleId);
        const clothing = image.appearance?.clothing
            ? clothingReplacement(role.wardrobe || "a costume", image.appearance.clothing)
            : undefined;
        pets.set(image.roleId, {
            roleId: image.roleId,
            phrase: image.phrase,
            token: image.deliveryToken,
            wardrobe: role.wardrobe,
            ...(clothing ? { clothing } : {}),
        });
    }
    return pets;
}
function publicUrlWarnings(images) {
    const missing = images.filter((image) => !image.url || !/^https?:\/\//i.test(image.url));
    if (!missing.length)
        return [];
    return [
        `These filled roles have no public http(s) image URL yet: ${missing.map((image) => image.roleId).join(", ")}. Video reference mode needs URLs the generator can fetch. Prompts were still adapted.`,
    ];
}
function retoken(prompt, images) {
    let next = prompt;
    for (const image of images)
        next = next.replaceAll(image.packToken, `%%ROLE_${image.roleId}%%`);
    for (const image of images)
        next = next.replaceAll(`%%ROLE_${image.roleId}%%`, image.deliveryToken);
    return next;
}
function inferDerived(segment, variant, prompt) {
    if (variant !== "single-performer")
        return undefined;
    const hasTimed = segment.script.timedCues.every((cue) => prompt.includes(cue.label));
    return hasTimed ? "timed-beats" : "locked-segment";
}
//# sourceMappingURL=adapt.js.map