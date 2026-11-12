export class TemplatePipelineError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "TemplatePipelineError";
        this.code = code;
    }
}
export class DurationPolicyError extends TemplatePipelineError {
    constructor(message) {
        super("duration_policy", message);
        this.name = "DurationPolicyError";
    }
}
export class PackValidationError extends TemplatePipelineError {
    constructor(message) {
        super("invalid_pack", message);
        this.name = "PackValidationError";
    }
}
export class MissingRequiredRoleError extends TemplatePipelineError {
    roleId;
    constructor(roleId) {
        super("missing_required_role", `Required role "${roleId}" has no customer image. The job stops instead of inventing a stand-in or keeping the template animal.`);
        this.name = "MissingRequiredRoleError";
        this.roleId = roleId;
    }
}
export class ImageAssignmentError extends TemplatePipelineError {
    constructor(message) {
        super("image_assignment", message);
        this.name = "ImageAssignmentError";
    }
}
/** Model prose was unusable. Callers should fall back; never forward the text. */
export class VisionOutputRejectedError extends TemplatePipelineError {
    constructor(message) {
        super("vision_output_rejected", message);
        this.name = "VisionOutputRejectedError";
    }
}
export class AgnesConfigError extends TemplatePipelineError {
    constructor(message) {
        super("agnes_config", message);
        this.name = "AgnesConfigError";
    }
}
export class StaleIdentityError extends TemplatePipelineError {
    terms;
    constructor(terms) {
        super("stale_identity", `Adapted prompt still contains template identity terms: ${terms.join(", ")}`);
        this.name = "StaleIdentityError";
        this.terms = terms;
    }
}
//# sourceMappingURL=errors.js.map