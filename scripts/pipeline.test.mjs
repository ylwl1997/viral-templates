import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  adaptPack,
  formatAgnesCreatePayload,
  parseTemplatePack,
  planGenerationSegments,
  splitDurationEven,
  toPromptSeconds,
  MetadataVisionAdapter,
} from '../packages/template-pipeline/dist/index.js';

const tinyPath = new URL('../packages/template-pipeline/packs/tiny-desk-pets/pack.json', import.meta.url);
const tinyBytes = fs.readFileSync(tinyPath);
const blob = Buffer.concat([Buffer.from(`blob ${tinyBytes.length}\0`), tinyBytes]);
assert.equal(createHash('sha1').update(blob).digest('hex'), '3630b0a3ca1ae5fa44cb3f1bfeaa1ac7251e84fc');
assert.equal(tinyBytes.length, 22294);

const tiny = parseTemplatePack(JSON.parse(tinyBytes.toString('utf8')));
const bby = parseTemplatePack(JSON.parse(fs.readFileSync(new URL('../packages/template-pipeline/packs/bby-wow-pets/pack.json', import.meta.url), 'utf8')));
const fan = parseTemplatePack(JSON.parse(fs.readFileSync(new URL('../packages/template-pipeline/packs/ceiling-fan-pets/pack.json', import.meta.url), 'utf8')));

assert.equal(tiny.sourceDurationSec, 17.76);
assert.deepEqual(tiny.provenance.shotBoundariesSec, [5.375, 11.625, 15]);
assert.deepEqual(tiny.generationSegments.map((segment) => [segment.startSec, segment.endSec, segment.promptSeconds]), [[0, 12, 12], [12, 17.76, 6]]);
assert.equal(planGenerationSegments(tiny)[0].promptSeconds, 12);
assert.equal(planGenerationSegments(tiny)[1].promptSeconds, 6);
assert.ok(!tiny.generationSegments.some((segment) => Math.abs((segment.endSec - segment.startSec) - 8.88) < 0.01));

const evenFan = splitDurationEven(15.278005);
assert.equal(evenFan.length, 2);
assert.ok(Math.abs(evenFan[0].durationSec - evenFan[1].durationSec) < 0.001);
assert.ok(evenFan.every((slice) => slice.durationSec >= 4 && slice.durationSec <= 12));
assert.equal(toPromptSeconds(evenFan[0].durationSec), 8);
assert.equal(fan.generationSegments[0].promptSeconds, 8);
assert.equal(fan.generationSegments[1].promptSeconds, 8);

const urls = [1, 2, 3, 4, 5].map((index) => `https://swaystill.com/pet/${index}.jpg`);
const band = await adaptPack(tiny, urls.map((url, index) => ({ roleId: tiny.roles[index].id, url })), { adapter: new MetadataVisionAdapter() });
assert.equal(band.variant, 'timed-beats');
assert.equal(band.collapsed, false);
assert.equal(band.segments[0].prompt, tiny.generationSegments[0].variantPrompts['timed-beats']);
assert.equal(band.segments[1].prompt, tiny.generationSegments[1].variantPrompts['timed-beats']);
assert.match(band.segments[0].prompt, /packed bookshelves/);
assert.match(band.segments[0].prompt, /warm practical/);
assert.match(band.segments[0].prompt, /vintage mics/);
assert.doesNotMatch(band.segments[0].prompt, /\bperson\b/i);

const first = formatAgnesCreatePayload(band, 'segment-1');
const second = formatAgnesCreatePayload(band, 'segment-2');
assert.equal(first.sent, false);
assert.equal(first.body.seconds, '12');
assert.equal(second.body.seconds, '6');
assert.equal(first.body.mode, 'reference');
assert.equal(first.body.size, '720P');
assert.equal(first.body.aspect_ratio, '9:16');
assert.equal(first.body.images.length, 5);
assert.equal(first.body.videos, undefined);
assert.equal(second.body.videos, undefined);

const solo = await adaptPack(tiny, [{ roleId: 'lead', url: urls[0] }]);
assert.equal(solo.collapsed, true);
assert.equal(solo.variant, 'timed-beats');
assert.equal(solo.segments.length, 2);
assert.equal(solo.segments[0].promptSeconds, 12);
assert.match(solo.segments[0].prompt, /<Image 1>/);
assert.doesNotMatch(solo.segments.map((segment) => segment.prompt).join('\n'), /Siberian husky|Pembroke|French bulldog|tuxedo cat/i);
assert.match(solo.segments[0].prompt, /Do not add another animal/);

const together = await adaptPack(tiny, [{ url: urls[0], shared: true }]);
assert.equal(together.variant, 'locked-segment');
assert.equal(together.stayTogether, true);
assert.match(together.segments[0].prompt, /stay together/i);
assert.deepEqual(together.shotBoundariesSec, [5.375, 11.625, 15]);
assert.doesNotMatch(together.segments[0].prompt, /Siberian husky/);

await assert.rejects(adaptPack(tiny, []), /lead_required/);

const bbyOne = await adaptPack(bby, [{ roleId: 'lead', url: urls[0] }]);
assert.equal(bbyOne.segments[0].promptSeconds, 6);
assert.match(bbyOne.segments[0].prompt, /<Image 1>/);
assert.doesNotMatch(bbyOne.segments[0].prompt, /\bperson\b/i);

const fanOne = await adaptPack(fan, [{ roleId: 'lead', url: urls[0] }]);
assert.deepEqual(fanOne.segments.map((segment) => segment.promptSeconds), [8, 8]);
assert.match(fanOne.segments[1].prompt, /plain raincoat/);
assert.match(fanOne.segments[0].prompt, /No fan in the photo/);
assert.doesNotMatch(fanOne.segments.map((segment) => segment.prompt).join('\n'), /another animal appears|second pet/i);

const ui = fs.readFileSync(new URL('../src/lib/templates.ts', import.meta.url), 'utf8');
assert.equal(ui.includes("slug: 'kiss-cam'"), false);
assert.match(ui, /slug: 'tiny-desk'/);

console.log('pipeline tests passed');
