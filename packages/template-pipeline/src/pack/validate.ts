import { ZodError } from "zod";
import { toPromptSeconds } from "../duration/split.js";
import { PackValidationError } from "../errors.js";
import { renderAuthoredVariant } from "../prompt/render.js";
import { imageIndex } from "../prompt/tokens.js";
import { adaptedPromptSetSchema, type AdaptedPromptSet } from "../schema/adapted.js";
import { templatePackSchema, type GenerationSegment, type TemplatePack } from "../schema/pack.js";

export function parseTemplatePack(input: unknown): TemplatePack {
  try {
    const pack = templatePackSchema.parse(input);
    assertPackInvariants(pack);
    return pack;
  } catch (error) {
    if (error instanceof PackValidationError) throw error;
    if (error instanceof ZodError) {
      throw new PackValidationError(error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
    }
    throw error;
  }
}

export function parseAdaptedPromptSet(input: unknown): AdaptedPromptSet {
  try {
    return adaptedPromptSetSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new PackValidationError(error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
    }
    throw error;
  }
}

export function assertPackInvariants(pack: TemplatePack): void {
  assertUnique(pack.roles.map((role) => role.id), "role id");
  assertUnique(pack.storyBeats.map((beat) => beat.id), "story beat id");
  assertUnique(pack.generationSegments.map((segment) => segment.id), "segment id");
  if (!pack.roles.some((role) => role.required)) {
    throw new PackValidationError("At least one role must be required.");
  }
  pack.roles.forEach((role, index) => {
    const expected = `<Image ${index + 1}>`;
    if (role.promptToken !== expected) {
      throw new PackValidationError(`Role "${role.id}" must use ${expected} so reference images stay 1-indexed.`);
    }
  });

  const beatIds = new Set(pack.storyBeats.map((beat) => beat.id));
  for (const beat of pack.storyBeats) {
    if (beat.endSec <= beat.startSec) throw new PackValidationError(`Beat "${beat.id}" has a non-positive duration.`);
    if (beat.endSec > pack.sourceDurationSec + 0.02) {
      throw new PackValidationError(`Beat "${beat.id}" ends after the source.`);
    }
  }

  const tokens = new Map(pack.roles.map((role) => [role.id, role.promptToken]));
  let cursor = 0;
  for (const segment of pack.generationSegments) {
    if (Math.abs(segment.startSec - cursor) > 0.02) {
      throw new PackValidationError(`Segment "${segment.id}" does not continue the previous segment.`);
    }
    if (Math.abs(segment.endSec - segment.startSec - segment.durationSec) > 0.02) {
      throw new PackValidationError(`Segment "${segment.id}" duration does not match its start and end.`);
    }
    if (segment.promptSeconds !== toPromptSeconds(segment.durationSec)) {
      throw new PackValidationError(
        `Segment "${segment.id}" promptSeconds must be ${toPromptSeconds(segment.durationSec)} for a ${segment.durationSec}s span.`,
      );
    }
    for (const beatId of segment.beatIds) {
      if (!beatIds.has(beatId)) throw new PackValidationError(`Segment "${segment.id}" references unknown beat "${beatId}".`);
    }
    assertScript(pack, segment, tokens);
    cursor = segment.endSec;
  }
  if (Math.abs(cursor - pack.sourceDurationSec) > 0.02) {
    throw new PackValidationError("Generation segments must cover the source duration.");
  }
  for (const boundary of pack.provenance.shotBoundariesSec) {
    if (boundary > pack.sourceDurationSec + 0.02) {
      throw new PackValidationError(`Shot boundary ${boundary}s is past the end of the source.`);
    }
  }
}

function assertScript(pack: TemplatePack, segment: GenerationSegment, tokens: Map<string, string>): void {
  const known = new Set(pack.roles.map((role) => role.id));
  const timed = renderAuthoredVariant(segment.script, tokens, "timed-beats");
  const locked = renderAuthoredVariant(segment.script, tokens, "locked-segment");
  if (timed !== segment.variantPrompts["timed-beats"]) {
    throw new PackValidationError(`Segment "${segment.id}" timed-beats prompt does not match its script.`);
  }
  if (locked !== segment.variantPrompts["locked-segment"]) {
    throw new PackValidationError(`Segment "${segment.id}" locked-segment prompt does not match its script.`);
  }
  if (!locked.includes(segment.script.lockedCamera)) {
    throw new PackValidationError(`Segment "${segment.id}" locked camera line is missing from the locked prompt.`);
  }
  if (!/no hard cuts/i.test(locked)) {
    throw new PackValidationError(`Segment "${segment.id}" locked prompt must say "no hard cuts".`);
  }
  let expectedStart = 0;
  for (const cue of segment.script.timedCues) {
    if (cue.startSec !== expectedStart || cue.endSec <= cue.startSec) {
      throw new PackValidationError(`Segment "${segment.id}" cue "${cue.label}" does not chain from ${expectedStart}s.`);
    }
    if (cue.label !== `${cue.startSec}-${cue.endSec}s`) {
      throw new PackValidationError(`Segment "${segment.id}" cue label ${cue.label} does not match its seconds.`);
    }
    if (!cue.camera.includes(cue.anchor) && !cue.opener.includes(cue.anchor)) {
      throw new PackValidationError(`Segment "${segment.id}" cue "${cue.label}" anchor is not in the camera line.`);
    }
    for (const subject of cue.subjects) {
      if (!known.has(subject.roleId)) throw new PackValidationError(`Unknown role "${subject.roleId}" in ${segment.id}.`);
      const token = tokens.get(subject.roleId)!;
      if (!subject.authored.includes(token)) {
        throw new PackValidationError(`Authored identity for "${subject.roleId}" must include ${token}.`);
      }
    }
    expectedStart = cue.endSec;
  }
  if (expectedStart !== segment.promptSeconds) {
    throw new PackValidationError(
      `Segment "${segment.id}" time cues end at ${expectedStart}s but promptSeconds is ${segment.promptSeconds}.`,
    );
  }
  for (const anchor of segment.script.styleAnchors) {
    if (!timed.includes(anchor) || !locked.includes(anchor)) {
      throw new PackValidationError(`Style anchor "${anchor}" must appear in both variants of "${segment.id}".`);
    }
  }
  for (const line of segment.script.lockedLines) {
    if (!known.has(line.roleId)) throw new PackValidationError(`Unknown role "${line.roleId}" in locked lines.`);
  }
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new PackValidationError(`Duplicate ${label} "${value}".`);
    seen.add(value);
  }
}

/** Rewrite variant prompt strings from their scripts, then validate. */
export function syncAuthoredPrompts(pack: TemplatePack): TemplatePack {
  const tokens = new Map(pack.roles.map((role) => [role.id, role.promptToken]));
  for (const segment of pack.generationSegments) {
    segment.variantPrompts["timed-beats"] = renderAuthoredVariant(segment.script, tokens, "timed-beats");
    segment.variantPrompts["locked-segment"] = renderAuthoredVariant(segment.script, tokens, "locked-segment");
  }
  return parseTemplatePack(pack);
}

export function roleTokenOrder(pack: TemplatePack): string[] {
  return [...pack.roles].sort((a, b) => imageIndex(a.promptToken) - imageIndex(b.promptToken)).map((role) => role.id);
}
