import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  adaptPack,
  formatAgnesCreatePayload,
  parseTemplatePack,
  planGenerationSegments,
  splitDurationEven,
  toPromptSeconds,
} from '../packages/template-pipeline/dist/site/index.js';

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
assert.deepEqual(
  tiny.generationSegments.map((segment) => [segment.startSec, segment.endSec, segment.promptSeconds]),
  [[0, 12, 12], [12, 17.76, 6]],
);
assert.deepEqual(planGenerationSegments(17.76, []).map((segment) => segment.strategy), ['even', 'even']);
assert.notDeepEqual(
  planGenerationSegments(17.76).map((segment) => segment.endSec),
  tiny.generationSegments.map((segment) => segment.endSec),
);

const evenFan = splitDurationEven(15.278005);
assert.deepEqual(evenFan, [7.639, 7.639]);
assert.equal(toPromptSeconds(evenFan[0]), 8);
assert.equal(fan.generationSegments[0].promptSeconds, 8);
assert.equal(fan.generationSegments[1].promptSeconds, 8);

const customers = [
  { roleId: 'lead', url: 'https://swaystill.com/pet/1.jpg', label: 'the seal-point Siamese', appearance: { breed: 'Siamese cat', colors: ['seal-point'] } },
  { roleId: 'keys', url: 'https://swaystill.com/pet/2.jpg', appearance: { breed: 'standard poodle', colors: ['apricot'] } },
  { roleId: 'left-backup', url: 'https://swaystill.com/pet/3.jpg', appearance: { breed: 'pug', colors: ['black'] } },
  { roleId: 'right-backup', url: 'https://swaystill.com/pet/4.jpg', appearance: { breed: 'calico cat' } },
  { roleId: 'sax', url: 'https://swaystill.com/pet/5.jpg', appearance: { breed: 'wheaten terrier' } },
];
const band = await adaptPack(tiny, customers);
const bandText = band.segments.map((segment) => segment.prompt).join('\n');
assert.notEqual(band.segments[0].prompt, tiny.generationSegments[0].variantPrompts['timed-beats']);
assert.notEqual(band.segments[1].prompt, tiny.generationSegments[1].variantPrompts['timed-beats']);
for (const term of ['orange tabby', 'Siberian husky', 'Pembroke', 'tuxedo', 'French bulldog', 'beagle', 'shiba', 'golden retriever']) {
  assert.equal(bandText.toLowerCase().includes(term.toLowerCase()), false, term);
}
assert.match(bandText, /bookshelves|packed/i);
assert.match(bandText, /vintage mics|vintage microphones/i);
assert.match(bandText, /9:16/);
assert.match(band.segments[0].prompt, /0-3s/);
assert.match(band.segments[0].prompt, /6-9s/);

const first = formatAgnesCreatePayload(band, 'segment-1');
const second = formatAgnesCreatePayload(band, 'segment-2');
assert.equal(first.notSent, true);
assert.equal(first.create.body.seconds, '12');
assert.equal(second.create.body.seconds, '6');
assert.equal(first.create.body.mode, 'reference');
assert.equal(first.create.body.size, '720P');
assert.equal(first.create.body.aspect_ratio, '9:16');
assert.equal(first.create.body.n, 1);
assert.equal(first.create.body.videos, undefined);
assert.equal(first.body, undefined);
assert.deepEqual(first.create.body.images, customers.map((image) => image.url));

const solo = await adaptPack(tiny, [{ roleId: 'lead', url: 'https://swaystill.com/pet/1.jpg', label: 'the grey cat' }]);
assert.equal(solo.segments.length, 2);
assert.deepEqual(solo.segments.map((segment) => segment.promptSeconds), [12, 6]);
assert.equal(solo.adaptation.interaction, 'single-performer');
const soloText = solo.segments.map((segment) => segment.prompt).join('\n');
for (const term of ['orange tabby', 'Siberian husky', 'Pembroke', 'tuxedo', 'French bulldog', 'beagle', 'shiba', 'golden retriever']) {
  assert.equal(soloText.toLowerCase().includes(term.toLowerCase()), false, `solo ${term}`);
}
assert.match(soloText, /<Image 1>/);
assert.match(soloText, /grey cat|the pet/i);

const together = await adaptPack(tiny, [{
  roleId: 'lead',
  url: 'https://swaystill.com/pet/pair.jpg',
  groupId: 'pair',
  appearance: { count: 2 },
}]);
assert.equal(together.adaptation.photoLayout, 'grouped');
assert.equal(together.adaptation.interaction, 'grouped-together');
assert.equal(together.segments[0].variant, 'locked-segment');
assert.match(together.segments[0].prompt, /stay together/i);

const bbyOne = await adaptPack(bby, [{ roleId: 'lead', url: 'https://swaystill.com/pet/1.jpg' }]);
assert.equal(bbyOne.segments[0].promptSeconds, 6);
assert.match(bbyOne.segments[0].prompt, /<Image 1>/);
assert.doesNotMatch(bbyOne.segments[0].prompt, /\bperson\b/i);

const fanOne = await adaptPack(fan, [{ roleId: 'lead', url: 'https://swaystill.com/pet/1.jpg' }]);
assert.deepEqual(fanOne.segments.map((segment) => segment.promptSeconds), [8, 8]);
assert.match(fanOne.segments[0].prompt, /no fan in the photo/i);
assert.match(fanOne.segments[1].prompt, /plain raincoat/i);

const ui = fs.readFileSync(new URL('../src/lib/templates.ts', import.meta.url), 'utf8');
assert.equal(ui.includes("slug: 'kiss-cam'"), false);

console.log('pipeline tests passed');
