import type { InteractionKind } from "../schema/adapted.js";
import type { TemplatePack } from "../schema/pack.js";
import type { LockedLine, OptionalSentence, SegmentScript, SubjectLine, TimedCueScript } from "../schema/script.js";
import type { GenerationSegment } from "../schema/pack.js";
import { stripArticle, wearingClause } from "./appearance.js";

export interface PetPhrase {
  roleId: string;
  phrase: string;
  token: string;
  wardrobe: string;
  clothing?: string;
}

export interface RenderContext {
  filled: Set<string>;
  pets: Map<string, PetPhrase>;
  primaryRoleId: string;
  interaction: InteractionKind;
}

/** Default pack text. Tokens and identity phrases stay exactly as authored. */
export function renderAuthoredVariant(
  script: SegmentScript,
  roles: ReadonlyMap<string, string>,
  variant: "timed-beats" | "locked-segment",
): string {
  if (variant === "timed-beats") {
    const cues = script.timedCues
      .map((cue) => renderTimedCue(cue, { authored: true, roles, pets: new Map(), filled: new Set(roles.keys()) }))
      .join("\n");
    return [script.timedHeader, cues, script.timedFooter].join("\n\n");
  }
  const lines = script.lockedLines
    .map((line) => renderLockedLine(line, roles.get(line.roleId) ?? "<Image 1>", line.identity, line.wardrobe))
    .join("\n");
  return [script.lockedIntro, lines, script.lockedExclusion].join("\n\n");
}

export function renderAdaptedTimed(
  pack: TemplatePack,
  segment: GenerationSegment,
  ctx: RenderContext,
): string {
  const cues = segment.script.timedCues
    .map((cue) => renderTimedCue(cue, { authored: false, roles: tokenMap(pack), pets: ctx.pets, filled: ctx.filled, primaryRoleId: ctx.primaryRoleId }))
    .join("\n");
  return [
    segment.script.timedHeader,
    interactionParagraph(ctx.interaction),
    cues,
    adaptFooter(segment.script.timedFooter, ctx.interaction),
    styleLine(pack),
  ].join("\n\n");
}

export function renderAdaptedLocked(
  pack: TemplatePack,
  segment: GenerationSegment,
  ctx: RenderContext,
): string {
  const scripted = segment.script.lockedLines.filter((line) => ctx.filled.has(line.roleId));
  const scriptedLines = scripted.map((line) => {
    const pet = ctx.pets.get(line.roleId)!;
    return renderLockedLine(line, pet.token, pet.phrase, pet.clothing ?? line.wardrobe);
  });
  const renderedIds = new Set(scripted.map((line) => line.roleId));
  const extras =
    ctx.interaction === "grouped-together"
      ? [...ctx.pets.values()].filter((pet) => !renderedIds.has(pet.roleId))
      : [];
  const extraLines = extras.map((pet) => {
    const role = pack.roles.find((item) => item.id === pet.roleId);
    return `${role?.position ?? "In frame"}: ${pet.token}, ${pet.phrase}, ${wearingClause(pet.clothing ?? pet.wardrobe)}, stays in frame with the pets from the same photo.`;
  });
  const fallback =
    scriptedLines.length === 0 && extraLines.length === 0
      ? [...ctx.pets.values()].map((pet) => {
          const role = pack.roles.find((item) => item.id === pet.roleId);
          return `${role?.position ?? "In frame"}: ${pet.token}, ${pet.phrase}, ${wearingClause(pet.clothing ?? pet.wardrobe)}, performs in this continuous shot.`;
        })
      : [];
  const lines = [...scriptedLines, ...extraLines, ...fallback];
  const camera = segment.script.lockedIntro.includes(segment.script.lockedCamera)
    ? []
    : [segment.script.lockedCamera];
  return [
    segment.script.lockedIntro,
    ...camera,
    interactionParagraph(ctx.interaction),
    lines.join("\n"),
    safeExclusion(ctx.filled.size),
    styleLine(pack),
  ].join("\n\n");
}

export function renderSingleTimed(
  pack: TemplatePack,
  segment: GenerationSegment,
  pet: PetPhrase,
): string {
  const cues = segment.script.timedCues.map((cue, index) => {
    const name =
      index === 0
        ? `${pet.phrase} from ${pet.token}`
        : `the same ${stripArticle(pet.phrase)} from ${pet.token}`;
    const wear = wearingClause(pet.clothing ?? pet.wardrobe);
    const wearBit = wear ? `, ${wear},` : "";
    return `${cue.label}: ${cue.camera} ${name}${wearBit} ${cue.singleAction}. No other animal enters.`;
  });
  return [
    `Photorealistic vertical ${pack.aspectRatio} video. Follow this time-coded direction. The only performer is the exact pet in the photo, not a human and not a different animal. No human faces and no human hands. Do not invent extra animals.`,
    cues.join("\n"),
    adaptFooter(segment.script.timedFooter, "single-performer"),
    styleLine(pack),
  ].join("\n\n");
}

export function renderSingleLocked(pack: TemplatePack, segment: GenerationSegment, pet: PetPhrase): string {
  const action = segment.script.lockedLines[0]?.action ?? "mouth moving on the beat";
  const setting = segment.script.setting.trim().replace(/\.+$/, "");
  const actionSentence = action.charAt(0).toUpperCase() + action.slice(1);
  return [
    `Photorealistic vertical ${pack.aspectRatio} video of a single continuous shot, no hard cuts. The only performer is the exact pet in the photo, not a human and not a different animal. No human faces and no human hands. Do not invent extra animals.`,
    segment.script.lockedCamera,
    `${setting}. The only animal is ${pet.phrase} from ${pet.token}, ${wearingClause(pet.clothing ?? pet.wardrobe)}. ${actionSentence}. No other animal enters.`,
    adaptFooter(segment.script.timedFooter, "single-performer"),
    styleLine(pack),
  ].join("\n\n");
}

function renderTimedCue(
  cue: TimedCueScript,
  mode: {
    authored: boolean;
    roles: ReadonlyMap<string, string>;
    pets: Map<string, PetPhrase>;
    filled: Set<string>;
    primaryRoleId?: string;
  },
): string {
  const subjects = cue.subjects.filter((subject) => mode.authored || mode.filled.has(subject.roleId));
  if (!mode.authored && subjects.length === 0) {
    const pet = mode.pets.get(mode.primaryRoleId ?? "") ?? [...mode.pets.values()][0];
    if (!pet) return `${cue.label}: ${cue.camera} The shot holds with no extra animal.`;
    return `${cue.label}: ${cue.camera} ${pet.phrase} from ${pet.token} is the only animal in this shot, ${cue.singleAction}. No other animal enters.`;
  }
  const rendered = subjects.map((subject) => renderSubject(subject, mode));
  const joined = joinSubjects(rendered);
  const opener = cue.opener.trim();
  const core = opener ? `${opener} ${joined}` : joined;
  const body = cue.closer.trim() ? `${core}, ${cue.closer.trim()}` : core;
  const optional = (cue.optionalSentences ?? [])
    .filter((sentence) => mode.authored || mode.filled.has(sentence.roleId))
    .map((sentence) => renderOptional(sentence, mode))
    .join(" ");
  const period = body.endsWith(".") ? "" : ".";
  return optional ? `${cue.label}: ${body}${period} ${optional}` : `${cue.label}: ${body}${period}`;
}

function renderSubject(
  subject: SubjectLine,
  mode: {
    authored: boolean;
    roles: ReadonlyMap<string, string>;
    pets: Map<string, PetPhrase>;
  },
): string {
  if (mode.authored) return `${subject.authored} ${subject.action}`.trim();
  const pet = mode.pets.get(subject.roleId);
  let action = subject.action;
  if (pet?.clothing && subject.wardrobePhrase) {
    action = action.replace(subject.wardrobePhrase, pet.clothing);
  }
  for (const bound of subject.boundPhrases ?? []) action = action.replaceAll(bound.from, bound.to);
  const phrase = pet?.phrase ?? "the pet";
  const token = pet?.token ?? mode.roles.get(subject.roleId) ?? "<Image 1>";
  return `${phrase} from ${token} ${action}`.trim();
}

function renderOptional(
  sentence: OptionalSentence,
  mode: {
    authored: boolean;
    roles: ReadonlyMap<string, string>;
    pets: Map<string, PetPhrase>;
  },
): string {
  const token = mode.authored
    ? (mode.roles.get(sentence.roleId) ?? "<Image 1>")
    : (mode.pets.get(sentence.roleId)?.token ?? "<Image 1>");
  const identity = mode.authored
    ? sentence.identity
    : stripArticle(mode.pets.get(sentence.roleId)?.phrase ?? sentence.identity);
  return sentence.template.replaceAll("{identity}", identity).replaceAll("{token}", token);
}

function renderLockedLine(line: LockedLine, token: string, identity: string, wardrobe: string): string {
  return `${line.position}: ${token}, ${identity}, in ${wardrobe}, ${line.action}.`;
}

function joinSubjects(bits: string[]): string {
  if (bits.length <= 1) return bits[0] ?? "";
  if (bits.length === 2) return `${bits[0]}, while ${bits[1]}`;
  return `${bits[0]}, while ${bits.slice(1, -1).join(", ")} and ${bits[bits.length - 1]}`;
}

export function interactionParagraph(interaction: InteractionKind): string {
  if (interaction === "single-performer") {
    return "The only performer is the pet in the photo. Do not add other animals.";
  }
  if (interaction === "grouped-together") {
    return "Pets that share a photo stay together in the frame and interact with each other. Do not split one photo into extra characters, and do not invent animals for empty roles.";
  }
  return "These pets come from separate photos. They share the shot and perform together. Each face matches only its own photo. Do not add animals for empty roles.";
}

function adaptFooter(footer: string, interaction: InteractionKind): string {
  const unnamed = footer.replace(/template dogs/gi, "template animals");
  if (interaction === "single-performer") {
    return unnamed.replace(/each animal'?s/gi, "this animal's");
  }
  return unnamed;
}

function safeExclusion(filledCount: number): string {
  const who = filledCount === 1 ? "this pet" : `all ${filledCount} pets named above`;
  return `Do not introduce any animal beyond the pets named above. Do not add a new species to fill an empty role. Keep ${who} clearly recognizable for the whole shot. Photorealistic, documentary lighting, mouths on the beat.`;
}

function styleLine(pack: TemplatePack): string {
  return `Style: ${pack.styleLine}`;
}

function tokenMap(pack: TemplatePack): Map<string, string> {
  return new Map(pack.roles.map((role) => [role.id, role.promptToken]));
}
