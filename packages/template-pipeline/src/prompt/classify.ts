import type { CountClass, InteractionKind, OutputVariant, PhotoLayout } from "../schema/adapted.js";
import type { CustomerImage } from "../schema/appearance.js";
import type { GenerationSegment, TemplatePack } from "../schema/pack.js";
import { MissingRequiredRoleError, ImageAssignmentError, PackValidationError } from "../errors.js";
import { customerImageSchema } from "../schema/appearance.js";
import { describeAppearance, ensureArticle, hasAppearanceFacts } from "./appearance.js";
import { deliveryToken, imageIndex } from "./tokens.js";
import type { AppearanceFacts } from "../schema/appearance.js";

export interface ResolvedImage {
  roleId: string;
  url?: string;
  path?: string;
  label?: string;
  groupId?: string;
  appearance?: AppearanceFacts;
  packToken: string;
  deliveryToken: string;
  phrase: string;
}

export interface CastClassification {
  petCount: number;
  countClass: CountClass;
  photoLayout: PhotoLayout;
  interaction: InteractionKind;
  reasons: string[];
}

export type VariantRequest = "auto" | "timed-beats" | "locked-segment";

export function resolveImages(pack: TemplatePack, images: CustomerImage[]): ResolvedImage[] {
  const byId = new Map(pack.roles.map((role) => [role.id, role]));
  const seen = new Set<string>();
  const resolved: ResolvedImage[] = [];

  for (const raw of images) {
    const parsed = customerImageSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ImageAssignmentError(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    const image = parsed.data;
    const role = byId.get(image.roleId);
    if (!role) throw new ImageAssignmentError(`Unknown role "${image.roleId}".`);
    if (seen.has(image.roleId)) throw new ImageAssignmentError(`Role "${image.roleId}" was assigned more than once.`);
    seen.add(image.roleId);
    resolved.push({
      roleId: image.roleId,
      url: image.url,
      path: image.path,
      label: image.label,
      groupId: image.groupId,
      appearance: image.appearance,
      packToken: role.promptToken,
      deliveryToken: role.promptToken,
      phrase: phraseFor(image.label, image.appearance),
    });
  }

  for (const role of pack.roles) {
    if (role.required && !seen.has(role.id)) throw new MissingRequiredRoleError(role.id);
  }

  resolved.sort((a, b) => imageIndex(a.packToken) - imageIndex(b.packToken));
  resolved.forEach((image, index) => {
    image.deliveryToken = deliveryToken(index);
  });
  return resolved;
}

export function phraseFor(label: string | undefined, appearance: AppearanceFacts | undefined): string {
  if (appearance && hasAppearanceFacts(appearance)) {
    if ((appearance.count ?? 1) > 1 && !appearance.breed && !appearance.species) {
      if (label?.trim()) return ensureArticle(label);
      return `the ${appearance.count} pets together`;
    }
    return describeAppearance(appearance);
  }
  if (label?.trim()) return ensureArticle(label);
  return "the pet";
}

export function classifyCast(images: ResolvedImage[]): CastClassification {
  const photos = new Map<string, { roles: number; count: number }>();
  for (const image of images) {
    const key = image.groupId || image.url || image.path || image.roleId;
    const current = photos.get(key) ?? { roles: 0, count: 1 };
    current.roles += 1;
    current.count = Math.max(current.count, image.appearance?.count ?? 1, current.roles);
    photos.set(key, current);
  }
  const petCount = [...photos.values()].reduce((sum, photo) => sum + photo.count, 0);
  const allSolo = [...photos.values()].every((photo) => photo.roles === 1 && photo.count === 1);
  const everyPhotoGrouped = [...photos.values()].every((photo) => photo.roles > 1 || photo.count > 1);

  let photoLayout: PhotoLayout;
  if (petCount <= 1) photoLayout = "single";
  else if (allSolo) photoLayout = "solo-stills";
  else if (everyPhotoGrouped) photoLayout = "grouped";
  else photoLayout = "mixed";

  const reasons: string[] = [];
  let interaction: InteractionKind;
  if (petCount <= 1) {
    interaction = "single-performer";
    reasons.push("One pet was uploaded, so the template collapses to that performer instead of inventing the rest of the cast.");
  } else if (photoLayout === "grouped" || photoLayout === "mixed") {
    interaction = "grouped-together";
    reasons.push("At least one photo contains more than one pet, or several roles share a photo. Those pets stay together in frame.");
  } else {
    interaction = "ensemble-in-frame";
    reasons.push("Separate solo photos fill an ensemble template, so the pets share the shot and each face stays tied to its own photo.");
  }
  reasons.push(`${images.length} role slot(s) filled, ${petCount} pet(s) counted.`);
  return {
    petCount,
    countClass: petCount <= 1 ? "single" : "multi",
    photoLayout,
    interaction,
    reasons,
  };
}

export function chooseVariant(
  segment: GenerationSegment,
  classification: CastClassification,
  requested: VariantRequest,
): { variant: OutputVariant; derivedFrom?: "timed-beats" | "locked-segment" } {
  const hardCut = segment.script.timedCues.some((cue) => /hard cut/i.test(`${cue.anchor} ${cue.camera} ${cue.opener}`));
  if (classification.interaction === "single-performer") {
    const derivedFrom =
      requested === "locked-segment" ? "locked-segment" : requested === "timed-beats" ? "timed-beats" : hardCut ? "timed-beats" : "locked-segment";
    return { variant: "single-performer", derivedFrom };
  }
  if (requested === "timed-beats" || requested === "locked-segment") return { variant: requested };
  if (classification.interaction === "grouped-together") return { variant: "locked-segment" };
  return { variant: "timed-beats" };
}

export function parseVariantRequest(value: string | undefined): VariantRequest {
  if (!value || value === "auto") return "auto";
  if (value === "timed-beats" || value === "locked-segment") return value;
  throw new PackValidationError(`Unknown variant "${value}". Use auto, timed-beats, or locked-segment.`);
}
