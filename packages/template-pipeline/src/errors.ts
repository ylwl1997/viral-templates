export class TemplatePipelineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TemplatePipelineError";
    this.code = code;
  }
}

export class DurationPolicyError extends TemplatePipelineError {
  constructor(message: string) {
    super("duration_policy", message);
    this.name = "DurationPolicyError";
  }
}

export class PackValidationError extends TemplatePipelineError {
  constructor(message: string) {
    super("invalid_pack", message);
    this.name = "PackValidationError";
  }
}

export class MissingRequiredRoleError extends TemplatePipelineError {
  readonly roleId: string;

  constructor(roleId: string) {
    super(
      "missing_required_role",
      `Required role "${roleId}" has no customer image. The job stops instead of inventing a stand-in or keeping the template animal.`,
    );
    this.name = "MissingRequiredRoleError";
    this.roleId = roleId;
  }
}

export class ImageAssignmentError extends TemplatePipelineError {
  constructor(message: string) {
    super("image_assignment", message);
    this.name = "ImageAssignmentError";
  }
}

/** Model prose was unusable. Callers should fall back; never forward the text. */
export class VisionOutputRejectedError extends TemplatePipelineError {
  constructor(message: string) {
    super("vision_output_rejected", message);
    this.name = "VisionOutputRejectedError";
  }
}

export class AgnesConfigError extends TemplatePipelineError {
  constructor(message: string) {
    super("agnes_config", message);
    this.name = "AgnesConfigError";
  }
}

export class StaleIdentityError extends TemplatePipelineError {
  readonly terms: string[];

  constructor(terms: string[]) {
    super(
      "stale_identity",
      `Adapted prompt still contains template identity terms: ${terms.join(", ")}`,
    );
    this.name = "StaleIdentityError";
    this.terms = terms;
  }
}
