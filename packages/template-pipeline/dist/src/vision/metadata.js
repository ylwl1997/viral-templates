/**
 * Deterministic adapter. Uses caller labels and appearance facts.
 * It does not read pixels and does not call a network.
 */
export class MetadataVisionAdapter {
    id = "metadata";
    describe(input) {
        return Promise.resolve({
            appearances: input.images.map((image) => ({
                roleId: image.roleId,
                appearance: image.appearance ?? {},
                phrase: image.phrase,
            })),
            model: "metadata",
        });
    }
}
//# sourceMappingURL=metadata.js.map