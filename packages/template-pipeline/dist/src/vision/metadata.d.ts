import type { VisionAdapter, VisionDescribeInput, VisionDescribeOutput } from "./types.js";
/**
 * Deterministic adapter. Uses caller labels and appearance facts.
 * It does not read pixels and does not call a network.
 */
export declare class MetadataVisionAdapter implements VisionAdapter {
    readonly id = "metadata";
    describe(input: VisionDescribeInput): Promise<VisionDescribeOutput>;
}
