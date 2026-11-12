import { AGNES_VIDEO_MODEL } from "../constants.js";
import type { AdaptedPromptSet } from "../schema/adapted.js";
export interface AgnesVideoCreateBody {
    model: typeof AGNES_VIDEO_MODEL;
    prompt: string;
    /** Documented as a string in the inclusive range "4"–"12". */
    seconds: string;
    mode: "reference";
    size: "720P";
    aspect_ratio: string;
    images: string[];
    n: 1;
}
export interface AgnesVideoCreateRequest {
    /** This helper never performs the POST. */
    notSent: true;
    create: {
        method: "POST";
        url: string;
        body: AgnesVideoCreateBody;
    };
    poll: {
        method: "GET";
        url: string;
        query: {
            video_id: string;
            model_name: typeof AGNES_VIDEO_MODEL;
        };
    };
    imageSlots: Array<{
        roleId: string;
        deliveryToken: string;
        url: string | null;
    }>;
    warnings: string[];
}
/**
 * Shape a reference-image video create body.
 * Images are ordered to match `<Image 1>` onward. No input video is attached.
 * Nothing is sent.
 */
export declare function formatAgnesCreatePayload(adapted: AdaptedPromptSet, segmentId: string): AgnesVideoCreateRequest;
