import { AGNES_BASE_URL, AGNES_VIDEO_CREATE_PATH, AGNES_VIDEO_MODEL, AGNES_VIDEO_POLL_URL } from "../constants.js";
import { PackValidationError } from "../errors.js";
/**
 * Shape a reference-image video create body.
 * Images are ordered to match `<Image 1>` onward. No input video is attached.
 * Nothing is sent.
 */
export function formatAgnesCreatePayload(adapted, segmentId) {
    const segment = adapted.segments.find((item) => item.id === segmentId);
    if (!segment)
        throw new PackValidationError(`Unknown segment "${segmentId}".`);
    const filled = adapted.roles.filter((role) => role.status === "filled" && role.deliveryToken);
    filled.sort((a, b) => tokenIndex(a.deliveryToken) - tokenIndex(b.deliveryToken));
    const imageSlots = filled.map((role) => ({
        roleId: role.roleId,
        deliveryToken: role.deliveryToken,
        url: role.image?.url && /^https?:\/\//i.test(role.image.url) ? role.image.url : null,
    }));
    const warnings = [];
    const missing = imageSlots.filter((slot) => !slot.url);
    if (missing.length) {
        warnings.push(`Missing public image URLs for ${missing.map((slot) => slot.roleId).join(", ")}. images was left empty so a partial list cannot shift <Image N> tokens. Do not POST this body yet.`);
    }
    if (/\bvideos\b|\baudios\b/.test(JSON.stringify({ prompt: segment.prompt })) && segment.prompt.includes("<Video")) {
        warnings.push("Prompt mentions a video token. This payload is images-only and does not send a reference video.");
    }
    return {
        notSent: true,
        create: {
            method: "POST",
            url: `${AGNES_BASE_URL}${AGNES_VIDEO_CREATE_PATH}`,
            body: {
                model: AGNES_VIDEO_MODEL,
                prompt: segment.prompt,
                seconds: String(segment.promptSeconds),
                mode: "reference",
                size: "720P",
                aspect_ratio: adapted.generationHints.aspectRatio,
                images: missing.length ? [] : imageSlots.map((slot) => slot.url),
                n: 1,
            },
        },
        poll: {
            method: "GET",
            url: AGNES_VIDEO_POLL_URL,
            query: { video_id: "<video_id from the create response>", model_name: AGNES_VIDEO_MODEL },
        },
        imageSlots,
        warnings,
    };
}
function tokenIndex(token) {
    const match = /^<Image (\d+)>$/.exec(token ?? "");
    return match ? Number(match[1]) : 99;
}
//# sourceMappingURL=agnes-video.js.map