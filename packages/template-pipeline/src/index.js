/**
 * Vendored runtime for template-pipeline.
 * Origin (ylwlceo/template-pipeline) is the source of truth.
 * This module does not call a network API and has no Bailian binding.
 */

import bbyWowPack from '../packs/bby-wow-pets/pack.json' with { type: 'json' };
import ceilingFanPack from '../packs/ceiling-fan-pets/pack.json' with { type: 'json' };
import tinyDeskPack from '../packs/tiny-desk-pets/pack.json' with { type: 'json' };

export const PIPELINE_SOURCE = 'https://cursor.com/codebase/ylwlceo/template-pipeline';
export const AGNES_VIDEO_MODEL = 'agnes-video-2.5';
export const VISION_DEFAULT = 'agnes-3.0-flash';
export const VISION_FALLBACK = 'agnes-2.5-flash';
const REFUSED_VISION = new Set(['agnes-2.5-pro', 'agnes-3.0-pro']);

const PACKS = {
  'bby-wow-pets': bbyWowPack,
  'ceiling-fan-pets': ceilingFanPack,
  'tiny-desk-pets': tinyDeskPack,
};

const TIME_CODE = /\d+\.\d{3}/g;

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

export function visionModelOrder() {
  return [VISION_DEFAULT, VISION_FALLBACK];
}

/** Accept only the flash defaults. Pro models are refused, including as a fallback. */
export function assertVisionModel(name) {
  const model = String(name || '').trim();
  if (REFUSED_VISION.has(model) || (model !== VISION_DEFAULT && model !== VISION_FALLBACK)) {
    throw fail('vision_model_refused');
  }
  return model;
}

export function timeCodes(text) {
  return String(text || '').match(TIME_CODE) || [];
}

export function getPack(id) {
  if (typeof id !== 'string' || !PACKS[id]) return null;
  return PACKS[id];
}

export function listPacks() {
  return Object.values(PACKS);
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

export function assertPack(pack) {
  if (!pack || typeof pack !== 'object') throw fail('bad_pack');
  if (pack.aspectRatio !== '9:16') throw fail('bad_pack');
  const duration = Number(pack.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) throw fail('bad_pack');
  if (!Array.isArray(pack.roles) || !pack.roles.length) throw fail('bad_pack');
  if (pack.roles[0].id !== 'lead' || pack.roles[0].required !== true) throw fail('bad_pack');
  if (!Array.isArray(pack.segments) || !pack.segments.length) throw fail('bad_pack');
  if (!Array.isArray(pack.cuts)) throw fail('bad_pack');
  let cursor = 0;
  for (const segment of pack.segments) {
    const start = Number(segment.start);
    const end = Number(segment.end);
    const length = end - start;
    if (Math.abs(start - cursor) > 0.002) throw fail('bad_pack');
    if (length < 3.99 || length > 12.01) throw fail('bad_pack');
    cursor = end;
  }
  if (Math.abs(cursor - duration) > 0.002) throw fail('bad_pack');
  for (const cut of pack.cuts) {
    const at = Number(cut);
    if (!Number.isFinite(at) || at <= 0 || at >= duration) throw fail('bad_pack');
  }
  if (!Array.isArray(pack.beats) || !pack.beats.length) throw fail('bad_pack');
  if (!Array.isArray(pack.locked) || pack.locked.length !== pack.segments.length) throw fail('bad_pack');
  return pack;
}

function outputSeconds(length) {
  const rounded = Math.round(Number(length));
  const clamped = Math.min(12, Math.max(4, rounded));
  return String(clamped);
}

function normalizeImages(pack, customerImages) {
  const list = Array.isArray(customerImages) ? customerImages : [];
  const roles = pack.roles.map((role) => role.id);
  const cleaned = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const subjects = Number(raw.subjects);
    const shared = raw.shared === true || raw.frame === 'together' || (Number.isFinite(subjects) && subjects > 1);
    const role = typeof raw.role === 'string' && roles.includes(raw.role) ? raw.role : '';
    cleaned.push({ role, shared });
  }
  if (!cleaned.length) return [];
  if (cleaned.length === 1) {
    return [{ role: 'lead', shared: cleaned[0].shared }];
  }
  const assigned = [];
  const used = new Set();
  for (const image of cleaned) {
    let role = image.role;
    if (!role || used.has(role)) {
      role = roles.find((id) => !used.has(id)) || '';
    }
    if (!role || used.has(role)) continue;
    used.add(role);
    assigned.push({ role, shared: false });
  }
  assigned.sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role));
  return assigned;
}

function classify(pack, images) {
  const shared = images.length === 1 && images[0].shared === true;
  const collapse = images.length === 1 && !shared;
  let variant = pack.variant === 'timed-beats' || pack.variant === 'locked-segment' ? pack.variant : '';
  if (!variant) variant = shared ? 'locked-segment' : 'timed-beats';
  if (pack.variant === 'auto' || !pack.variant) {
    variant = shared ? 'locked-segment' : 'timed-beats';
  }
  return { variant, shared, collapse, stayTogether: shared };
}

function petPhrase(token) {
  return `the pet in ${token}`;
}

function groupPhrase(images) {
  if (images.length === 1 && images[0].shared) return `The pets in ${images[0].token} stay together`;
  if (images.length === 1) return `The pet in ${images[0].token}`;
  const tokens = images.map((image) => image.token).join(', ');
  return `The pets in ${tokens}`;
}

function holdLine(beat) {
  const stamp = beat.times.join(' / ');
  return `${stamp}: hold the pets already in frame. Do not add another animal.`;
}

function composeTimed(pack, images, collapse) {
  const byRole = new Map(images.map((image) => [image.role, image]));
  const lead = byRole.get('lead');
  return pack.segments.map((segment) => {
    const beats = pack.beats.filter((beat) => beat.start >= segment.start - 0.001 && beat.start < segment.end - 0.001);
    const lines = beats.map((beat) => {
      const filled = byRole.get(beat.role);
      if (collapse) {
        return beat.solo.split('{{pet}}').join(petPhrase(lead.token));
      }
      if (!filled) return holdLine(beat);
      return beat.cast.split('{{pet}}').join(petPhrase(filled.token));
    });
    const tokens = images.map((image) => image.token).join(' ');
    lines.push(`Use only ${tokens}. Vertical 9:16. No people.`);
    return {
      index: segment.index,
      start: segment.start,
      end: segment.end,
      seconds: outputSeconds(segment.end - segment.start),
      prompt: lines.join(' '),
    };
  });
}

function composeLocked(pack, images) {
  const group = groupPhrase(images);
  return pack.segments.map((segment, index) => ({
    index: segment.index,
    start: segment.start,
    end: segment.end,
    seconds: outputSeconds(segment.end - segment.start),
    prompt: `${pack.locked[index].split('{{group}}').join(group)} Use only ${images.map((image) => image.token).join(' ')}.`,
  }));
}

function numbered(images) {
  return images.map((image, index) => ({
    role: image.role,
    shared: image.shared === true,
    token: `<Image ${index + 1}>`,
  }));
}

/**
 * Rewrite identity, count, and interaction.
 * Aspect ratio, duration, cuts, and time codes stay on the pack.
 */
export function adaptPack(pack, customerImages, options = {}) {
  const source = assertPack(pack);
  const images = normalizeImages(source, customerImages);
  if (!images.some((image) => image.role === 'lead')) throw fail('lead_required');
  const mode = classify(source, images);
  const cast = numbered(images);
  const segments = mode.variant === 'locked-segment'
    ? composeLocked(source, cast)
    : composeTimed(source, cast, mode.collapse);
  const adapted = {
    packId: source.id,
    slug: source.slug,
    aspectRatio: source.aspectRatio,
    durationSeconds: source.durationSeconds,
    cuts: source.cuts.map((cut) => Number(cut)),
    variant: mode.variant,
    stayTogether: mode.stayTogether,
    collapsed: mode.collapse,
    images: cast.map((image) => ({ role: image.role, token: image.token })),
    segments,
  };
  if (options.vision == null) return adapted;
  return applyVisionRewrite(adapted, options.vision);
}

/** Invalid JSON or a rewrite that moves cuts / time codes is discarded. */
export function applyVisionRewrite(deterministic, raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { ...deterministic, vision: 'discarded' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...deterministic, vision: 'discarded' };
  }
  if (JSON.stringify(parsed.cuts) !== JSON.stringify(deterministic.cuts)) {
    return { ...deterministic, vision: 'discarded' };
  }
  if (Number(parsed.durationSeconds) !== Number(deterministic.durationSeconds)) {
    return { ...deterministic, vision: 'discarded' };
  }
  if (parsed.aspectRatio && parsed.aspectRatio !== deterministic.aspectRatio) {
    return { ...deterministic, vision: 'discarded' };
  }
  if (!Array.isArray(parsed.segments) || parsed.segments.length !== deterministic.segments.length) {
    return { ...deterministic, vision: 'discarded' };
  }
  for (let index = 0; index < deterministic.segments.length; index += 1) {
    const current = deterministic.segments[index];
    const next = parsed.segments[index];
    if (!next || typeof next.prompt !== 'string') return { ...deterministic, vision: 'discarded' };
    if (Number(next.start) !== Number(current.start) || Number(next.end) !== Number(current.end)) {
      return { ...deterministic, vision: 'discarded' };
    }
    if (timeCodes(next.prompt).join(',') !== timeCodes(current.prompt).join(',')) {
      return { ...deterministic, vision: 'discarded' };
    }
  }
  return {
    ...deterministic,
    vision: 'applied',
    segments: deterministic.segments.map((segment, index) => ({
      ...segment,
      prompt: parsed.segments[index].prompt,
    })),
  };
}

/**
 * Not-sent Agnes Video 2.5 body. Images only. No input video.
 * 720P, 9:16, mode reference.
 */
export function formatAgnesCreatePayload(adapted, imageUrls) {
  if (!adapted || !Array.isArray(adapted.segments) || !adapted.segments.length) throw fail('bad_pack');
  const urls = Array.isArray(imageUrls) ? imageUrls.map((url) => String(url || '').trim()) : [];
  if (!urls.length || urls.some((url) => !url)) throw fail('image_count');
  if (adapted.images && urls.length !== adapted.images.length) throw fail('image_count');
  const segments = adapted.segments.map((segment) => {
    const prompt = String(segment.prompt || '');
    for (let index = 1; index <= urls.length; index += 1) {
      if (!prompt.includes(`<Image ${index}>`)) throw fail('bad_prompt');
    }
    if (prompt.includes('<Video') || /\bperson\b/i.test(prompt)) throw fail('bad_prompt');
    const body = {
      model: AGNES_VIDEO_MODEL,
      prompt,
      seconds: String(segment.seconds),
      mode: 'reference',
      size: '720P',
      aspect_ratio: '9:16',
      images: urls.slice(),
    };
    return {
      index: segment.index,
      start: segment.start,
      end: segment.end,
      seconds: body.seconds,
      prompt,
      body,
    };
  });
  return {
    sent: false,
    imagesOnly: true,
    model: AGNES_VIDEO_MODEL,
    mode: 'reference',
    size: '720P',
    aspect_ratio: adapted.aspectRatio,
    segments,
  };
}

export function roundSeconds(value) {
  return round3(value);
}
