import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { aspectTooWide, assertReferenceImage, probeImage } from '../functions/_lib/image-precheck.js';
import {
  audioPayload,
  finishGeneratedMp4,
  mp4HasAudio,
  stampAiGenerated,
  withoutAudioTrack,
  xmpDeclaresAi,
} from '../functions/_lib/mp4-finish.js';

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function expectCode(fn, code) {
  try {
    fn();
  } catch (err) {
    assert(err && err.code === code, `expected ${code}, got ${err && err.code}`);
    return;
  }
  throw new Error(`expected ${code}`);
}

const ok = assertReferenceImage(probeImage('jpeg', 720, 1280));
assert(ok.width === 720 && ok.height === 1280 && ok.ext === 'jpg', 'jpeg size');
assert(assertReferenceImage(probeImage('png', 300, 750)).ext === 'png', 'edge aspect');
assert(!aspectTooWide(300, 750), '2.5 is allowed');
expectCode(() => assertReferenceImage(probeImage('jpeg', 299, 400)), 'photo_too_small');
expectCode(() => assertReferenceImage(probeImage('jpeg', 751, 300)), 'photo_aspect');
expectCode(() => assertReferenceImage(probeImage('webp', 100, 100)), 'photo_too_small');
expectCode(() => assertReferenceImage(Uint8Array.from(Array(40).fill(1))), 'bad_photo');

const poster = probeImage('jpeg', 64, 64);
const labeled = stampAiGenerated(Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...Array(24).fill(0)]));
assert(xmpDeclaresAi(labeled), 'xmp marker');
assert(labeled[4] === 0x66 && labeled[5] === 0x74, 'ftyp stayed first');
assert(!xmpDeclaresAi(poster), 'photo is not a labeled video');

for (const name of ['audio-bed.mp4']) {
  const src = fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  assert(mp4HasAudio(src), `${name} has no music bed`);
  const silent = withoutAudioTrack(src);
  assert(!mp4HasAudio(silent), `${name} strip left audio`);
  const finished = finishGeneratedMp4(silent, src);
  assert(mp4HasAudio(finished) && xmpDeclaresAi(finished), `${name} finish`);
  const before = audioPayload(src);
  const after = audioPayload(finished);
  assert(before.length === after.length && before.every((byte, i) => byte === after[i]), `${name} audio bytes`);
  const out = `/tmp/vt-finish-${name}`;
  fs.writeFileSync(out, finished);
  execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-f', 'null', '-'], { stdio: 'inherit' });
}

console.log('media finish tests passed');
