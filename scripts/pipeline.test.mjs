import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptPack, applyVisionRewrite, assertPack, assertVisionModel, formatAgnesCreatePayload, getPack, timeCodes } from '../packages/template-pipeline/src/index.js';
import { getTemplate, TEMPLATE_CATALOG } from '../functions/_lib/templates.js';

const tiny = getPack('tiny-desk-pets');
const bby = getPack('bby-wow-pets');
const fan = getPack('ceiling-fan-pets');
assertPack(tiny);
assertPack(bby);
assertPack(fan);
assert.equal(tiny.durationSeconds, 17.76);
assert.deepEqual(tiny.cuts, [5.375, 11.625, 15]);
assert.equal(tiny.segments.length, 2);
for (const segment of tiny.segments) {
  const length = segment.end - segment.start;
  assert.ok(length >= 4 && length <= 12, length);
}

const filePack = JSON.parse(fs.readFileSync(new URL('../packages/template-pipeline/packs/tiny-desk-pets/pack.json', import.meta.url), 'utf8'));
assert.equal(filePack.id, tiny.id);
assert.equal(filePack.durationSeconds, 17.76);

const example = JSON.parse(fs.readFileSync(new URL('../packages/template-pipeline/examples/tiny-desk-pets-5s-test.json', import.meta.url), 'utf8'));
assert.match(example['timed-beats'], /1\.250s/);
assert.match(example['locked-segment'], /stay together/);
assert.doesNotMatch(`${example['timed-beats']} ${example['locked-segment']}`, /\bperson\b/i);

const one = adaptPack(tiny, [{ role: 'lead' }]);
assert.equal(one.variant, 'timed-beats');
assert.equal(one.collapsed, true);
assert.equal(one.stayTogether, false);
assert.equal(one.images.length, 1);
assert.equal(one.durationSeconds, 17.76);
assert.deepEqual(one.cuts, tiny.cuts);
assert.match(one.segments[0].prompt, /<Image 1>/);
assert.doesNotMatch(one.segments.map((segment) => segment.prompt).join(' '), /keys pet|a second pet playing/i);
assert.match(one.segments.map((segment) => segment.prompt).join(' '), /Do not add another animal|Do not add a saxophone/);
assert.deepEqual(timeCodes(one.segments[0].prompt), timeCodes(adaptPack(tiny, [{ role: 'lead' }]).segments[0].prompt));

const band = adaptPack(tiny, [
  { role: 'lead' },
  { role: 'keys' },
  { role: 'left-backup' },
  { role: 'right-backup' },
  { role: 'sax' },
]);
assert.equal(band.variant, 'timed-beats');
assert.equal(band.collapsed, false);
assert.equal(band.images.length, 5);
assert.match(band.segments[1].prompt, /<Image 5>/);
assert.doesNotMatch(band.segments.map((segment) => segment.prompt).join(' '), /\bperson\b/i);

const together = adaptPack(tiny, [{ shared: true }]);
assert.equal(together.variant, 'locked-segment');
assert.equal(together.stayTogether, true);
assert.equal(together.collapsed, false);
assert.match(together.segments[0].prompt, /stay together/i);
assert.deepEqual(together.cuts, tiny.cuts);

const partial = adaptPack(tiny, [{}, {}]);
assert.equal(partial.images.length, 2);
assert.match(partial.segments[0].prompt, /<Image 1>/);
assert.match(partial.segments[0].prompt, /<Image 2>/);
assert.doesNotMatch(partial.segments[1].prompt, /<Image 3>/);

assert.throws(() => adaptPack(tiny, []), /lead_required/);
assert.throws(() => assertVisionModel('agnes-3.0-pro'), /vision_model_refused/);
assert.throws(() => assertVisionModel('agnes-2.5-pro'), /vision_model_refused/);
assert.equal(assertVisionModel('agnes-3.0-flash'), 'agnes-3.0-flash');
assert.equal(assertVisionModel('agnes-2.5-flash'), 'agnes-2.5-flash');

const moved = applyVisionRewrite(one, JSON.stringify({
  cuts: [1],
  durationSeconds: one.durationSeconds,
  segments: one.segments,
}));
assert.equal(moved.vision, 'discarded');
assert.deepEqual(moved.cuts, one.cuts);
const badJson = applyVisionRewrite(one, '{');
assert.equal(badJson.vision, 'discarded');
const kept = applyVisionRewrite(one, {
  cuts: one.cuts,
  durationSeconds: one.durationSeconds,
  aspectRatio: '9:16',
  segments: one.segments.map((segment) => ({ ...segment, prompt: segment.prompt })),
});
assert.equal(kept.vision, 'applied');

const payload = formatAgnesCreatePayload(band, band.images.map((_, index) => `https://swaystill.com/pet/${index + 1}.jpg`));
assert.equal(payload.sent, false);
assert.equal(payload.imagesOnly, true);
assert.equal(payload.size, '720P');
assert.equal(payload.aspect_ratio, '9:16');
assert.equal(payload.mode, 'reference');
assert.equal(payload.model, 'agnes-video-2.5');
assert.equal(payload.segments.length, 2);
for (const segment of payload.segments) {
  assert.equal(segment.body.mode, 'reference');
  assert.equal(segment.body.size, '720P');
  assert.equal(segment.body.aspect_ratio, '9:16');
  assert.equal(segment.body.images.length, 5);
  assert.equal(segment.body.videos, undefined);
  assert.equal(Number(segment.seconds) >= 4 && Number(segment.seconds) <= 12, true);
}

const bbyOne = adaptPack(bby, [{}]);
assert.equal(bbyOne.segments.length, 1);
assert.equal(bbyOne.segments[0].seconds, '6');
assert.match(bbyOne.segments[0].prompt, /pet in <Image 1>/);
const fanOne = adaptPack(fan, [{}]);
assert.equal(fanOne.segments.length, 2);
assert.ok(fanOne.segments.every((segment) => segment.seconds === '8'));

assert.equal(getTemplate('kiss-cam').retired, true);
assert.equal(getTemplate('kiss-cam').creatable, false);
assert.equal(getTemplate('tiny-desk').packId, 'tiny-desk-pets');
assert.equal(getTemplate('bby-wow').packId, 'bby-wow-pets');
assert.equal(getTemplate('ceiling-fan').packId, 'ceiling-fan-pets');
assert.equal(TEMPLATE_CATALOG['kiss-cam'].referenceVideo, undefined);

const ui = fs.readFileSync(new URL('../src/lib/templates.ts', import.meta.url), 'utf8');
const pages = [
  'src/pages/index.astro',
  'src/pages/zh/index.astro',
  'src/lib/hubFaq.ts',
  'src/lib/liveCases.ts',
  'src/pages/terms/index.astro',
  'src/pages/privacy/index.astro',
].map((path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')).join('\n');
assert.equal(ui.includes("slug: 'kiss-cam'"), false);
assert.equal(/Coldplay|Kiss Cam|adult-consent/i.test(pages), false);
assert.match(ui, /slug: 'tiny-desk'/);
assert.match(pages, /pet/i);

console.log('pipeline tests passed');
