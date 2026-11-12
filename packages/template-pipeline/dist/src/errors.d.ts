export declare class TemplatePipelineError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare class DurationPolicyError extends TemplatePipelineError {
    constructor(message: string);
}
export declare class PackValidationError extends TemplatePipelineError {
    constructor(message: string);
}
export declare class MissingRequiredRoleError extends TemplatePipelineError {
    readonly roleId: string;
    constructor(roleId: string);
}
export declare class ImageAssignmentError extends TemplatePipelineError {
    constructor(message: string);
}
/** Model prose was unusable. Callers should fall back; never forward the text. */
export declare class VisionOutputRejectedError extends TemplatePipelineError {
    constructor(message: string);
}
export declare class AgnesConfigError extends TemplatePipelineError {
    constructor(message: string);
}
export declare class StaleIdentityError extends TemplatePipelineError {
    readonly terms: string[];
    constructor(terms: string[]);
}
