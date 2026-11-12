import { fail } from './segments.js';
import type {
  AdaptedImage,
  AdaptedPromptSet,
  AdaptedSegment,
  CustomerImage,
  GenerationSegment,
  TemplatePack,
  Variant,
} from './types.js';

type Filled = AdaptedImage & { originalToken: string };

function normalize(pack: TemplatePack, customerImages: CustomerImage[]): { filled: Filled[]; variant: Variant; stayTogether: boolean; collapsed: boolean } {
  const list = Array.isArray(customerImages) ? customerImages.filter((image) => image && typeof image === 'object') : [];
  if (!list.length) throw fail('lead_required');
  const shared = list.length === 1 && (list[0].shared === true || Number(list[0].subjects) > 1);
  if (shared) {
    return {
      filled: [{ roleId: 'lead', url: String(list[0].url || ''), token: '<Image 1>', originalToken: pack.roles[0].promptToken || '<Image 1>' }],
      variant: 'locked-segment',
      stayTogether: true,
      collapsed: false,
    };
  }
  if (list.length === 1) {
    return {
      filled: [{ roleId: 'lead', url: String(list[0].url || ''), token: '<Image 1>', originalToken: pack.roles[0].promptToken || '<Image 1>' }],
      variant: 'timed-beats',
      stayTogether: false,
      collapsed: true,
    };
  }
  const used = new Set<string>();
  const assigned: { roleId: string; url: string }[] = [];
  for (const image of list) {
    let roleId = typeof image.roleId === 'string' && pack.roles.some((role) => role.id === image.roleId) ? image.roleId : '';
    if (!roleId || used.has(roleId)) {
      const next = pack.roles.find((role) => !used.has(role.id));
      roleId = next ? next.id : '';
    }
    if (!roleId || used.has(roleId)) continue;
    used.add(roleId);
    assigned.push({ roleId, url: String(image.url || '') });
  }
  assigned.sort((a, b) => pack.roles.findIndex((role) => role.id === a.roleId) - pack.roles.findIndex((role) => role.id === b.roleId));
  if (!assigned.some((image) => image.roleId === 'lead')) throw fail('lead_required');
  const filled = assigned.map((image, index) => {
    const role = pack.roles.find((item) => item.id === image.roleId);
    return {
      roleId: image.roleId,
      url: image.url,
      token: `<Image ${index + 1}>`,
      originalToken: role && role.promptToken ? role.promptToken : `<Image ${index + 1}>`,
    };
  });
  return { filled, variant: 'timed-beats', stayTogether: false, collapsed: false };
}

function renumber(text: string, filled: Filled[]): string {
  const pairs = filled
    .filter((image) => image.originalToken && image.originalToken !== image.token)
    .sort((a, b) => b.originalToken.length - a.originalToken.length);
  let next = text;
  for (const image of pairs) next = next.split(image.originalToken).join(image.token);
  return next;
}

function authoredFits(segment: GenerationSegment, variant: Variant, filled: Filled[]): boolean {
  const prompt = segment.variantPrompts[variant];
  const mentioned = prompt.match(/<Image \d+>/g) || [];
  const unique = [...new Set(mentioned)];
  if (!unique.length) return false;
  return unique.every((token) => filled.some((image) => image.originalToken === token));
}

function timedPartial(segment: GenerationSegment, filled: Filled[], collapsed: boolean): string {
  const script = segment.script;
  const header = script && script.timedHeader
    ? script.timedHeader
    : 'Photorealistic vertical 9:16 video. Every performer is the pet in the photos. No human faces and no human hands.';
  const lines = [header];
  const byRole = new Map(filled.map((image) => [image.roleId, image]));
  const setting = script && script.setting ? script.setting : '';
  for (const cue of (script && script.timedCues) || []) {
    if (collapsed) {
      const action = cue.singleAction || 'continues the same beat';
      lines.push(`${cue.label}: ${cue.camera || cue.opener || ''} the pet in <Image 1> ${action}. ${setting} Do not add another animal.`.replace(/\s+/g, ' ').trim());
      continue;
    }
    const subjects = (cue.subjects || []).filter((subject) => byRole.has(subject.roleId));
    const optional = (cue.optionalSentences || []).filter((sentence) => byRole.has(sentence.roleId));
    if (!subjects.length && !optional.length) {
      lines.push(`${cue.label}: ${cue.camera || ''} hold the pets already in frame. Do not add another animal.`.replace(/\s+/g, ' ').trim());
      continue;
    }
    const body = subjects
      .map((subject) => `the pet in ${byRole.get(subject.roleId)!.token} ${subject.action || ''}`.trim())
      .join(', while ');
    let line = `${cue.label}: ${cue.opener || ''} ${body}. ${cue.closer || ''}`.replace(/\s+/g, ' ').trim();
    for (const sentence of optional) {
      const token = byRole.get(sentence.roleId)!.token;
      line += ` ${sentence.template.split('{identity}').join('the pet').split('{token}').join(token)}`;
    }
    lines.push(line);
  }
  if (script && script.timedFooter) lines.push(script.timedFooter);
  return lines.join('\n\n');
}

function lockedPartial(segment: GenerationSegment, filled: Filled[], stayTogether: boolean): string {
  const script = segment.script;
  const setting = script && script.setting ? script.setting : '';
  const camera = script && script.lockedCamera ? script.lockedCamera : 'One continuous shot, no hard cuts.';
  if (stayTogether) {
    return [
      'Photorealistic vertical 9:16 video of a single continuous shot, no hard cuts.',
      camera,
      setting,
      'The pets in <Image 1> stay together for the whole shot. No human faces and no human hands.',
      'Do not add an animal who is not in that photo.',
    ].filter(Boolean).join('\n\n');
  }
  const byRole = new Map(filled.map((image) => [image.roleId, image]));
  const lines = [
    script && script.lockedIntro
      ? script.lockedIntro
      : 'Photorealistic vertical 9:16 video of a single continuous shot, no hard cuts. No human faces and no human hands.',
  ];
  for (const line of (script && script.lockedLines) || []) {
    const image = byRole.get(line.roleId);
    if (!image) continue;
    const wardrobe = line.wardrobe ? `, in ${line.wardrobe}` : '';
    lines.push(`${line.position || line.roleId}: ${image.token}, the pet in ${image.token}${wardrobe}, ${line.action || 'on the beat'}.`);
  }
  lines.push('Do not add an animal who was not named above.');
  return lines.join('\n\n');
}

function promptFor(segment: GenerationSegment, filled: Filled[], variant: Variant, collapsed: boolean, stayTogether: boolean): string {
  if (stayTogether) return lockedPartial(segment, filled, true);
  if (authoredFits(segment, variant, filled)) return renumber(segment.variantPrompts[variant], filled);
  if (variant === 'locked-segment') return lockedPartial(segment, filled, false);
  return timedPartial(segment, filled, collapsed);
}

export function adaptMetadata(pack: TemplatePack, customerImages: CustomerImage[]): AdaptedPromptSet {
  const cast = normalize(pack, customerImages);
  const segments: AdaptedSegment[] = pack.generationSegments.map((segment, index) => ({
    id: segment.id,
    index,
    startSec: segment.startSec,
    endSec: segment.endSec,
    durationSec: segment.durationSec,
    promptSeconds: segment.promptSeconds,
    prompt: promptFor(segment, cast.filled, cast.variant, cast.collapsed, cast.stayTogether),
  }));
  return {
    packId: pack.id,
    aspectRatio: pack.aspectRatio,
    sourceDurationSec: pack.sourceDurationSec,
    shotBoundariesSec: pack.provenance && pack.provenance.shotBoundariesSec ? pack.provenance.shotBoundariesSec.slice() : [],
    variant: cast.variant,
    stayTogether: cast.stayTogether,
    collapsed: cast.collapsed,
    images: cast.filled.map(({ roleId, url, token }) => ({ roleId, url, token })),
    segments,
  };
}
