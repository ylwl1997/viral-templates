import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { appendLedger, ensureSchema, getCredits } from '../functions/_lib/account-db.js';
import { agnesMediaDecision, unpackAgnesTaskId } from '../functions/_lib/agnes.js';
import { probeImage } from '../functions/_lib/image-precheck.js';
import {
  IMAGINE_MAX_REFERENCE_IMAGES,
  IMAGINE_MODEL,
  buildImagineRequest,
  citeImagineImages,
  formatImagineCreatePayload,
  imagineDuration,
  imagineRuntime,
  packImagineTaskId,
  packImagineTaskSet,
  unpackImagineTaskId,
} from '../functions/_lib/imagine.js';
import { queueJobWithMedia } from '../functions/_lib/job-media.js';
import { processRemakeJobs } from '../functions/_lib/bailian-worker.js';
import { adaptPack, parseTemplatePack } from '../packages/template-pipeline/dist/site/index.js';
import { plannedReferenceImages, resolveVideoProvider, selectRemakeProvider } from '../functions/_lib/video-provider.js';
import { getTemplate } from '../functions/_lib/templates.js';
import bbyWowPack from '../packages/template-pipeline/packs/bby-wow-pets/pack.json' with { type: 'json' };
import ceilingFanPack from '../packages/template-pipeline/packs/ceiling-fan-pets/pack.json' with { type: 'json' };
import tinyDeskPack from '../packages/template-pipeline/packs/tiny-desk-pets/pack.json' with { type: 'json' };

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

const STALE = ['orange tabby', 'Siberian husky', 'Pembroke', 'tuxedo', 'French bulldog', 'beagle', 'shiba', 'golden retriever'];
const XAI_KEY = 'xai-test-key-not-real';
const AGNES_KEY = 'agnes-test-key-not-real';
const jpeg = probeImage('jpeg', 720, 1280);
const piece0 = fs.readFileSync(new URL('./fixtures/compatible-join/p0.mp4', import.meta.url));
const piece1 = fs.readFileSync(new URL('./fixtures/compatible-join/p1.mp4', import.meta.url));

const bby = parseTemplatePack(bbyWowPack);
const fan = parseTemplatePack(ceilingFanPack);
const tiny = parseTemplatePack(tinyDeskPack);

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function runtime(extra = {}) {
  return imagineRuntime({
    XAI_API_KEY: XAI_KEY,
    PUBLIC_SITE_APEX: 'swaystill.com',
    ...extra,
  });
}

assert(resolveVideoProvider({}) === 'agnes', 'default provider');
assert(resolveVideoProvider({ XAI_API_KEY: XAI_KEY }) === 'agnes', 'key alone stays on agnes');
assert(resolveVideoProvider({ VIDEO_PROVIDER: 'agnes', XAI_API_KEY: XAI_KEY }) === 'agnes', 'explicit agnes');
assert(resolveVideoProvider({ VIDEO_PROVIDER: 'Imagine' }) === 'imagine', 'explicit imagine');
assert(resolveVideoProvider({ VIDEO_PROVIDER: 'bailian', XAI_API_KEY: XAI_KEY }) === 'bailian', 'bailian ignores the xai key');
let unknown = false;
try {
  resolveVideoProvider({ VIDEO_PROVIDER: 'kling' });
} catch (err) {
  unknown = err && err.code === 'video_provider';
}
assert(unknown, 'unknown provider');

const decision = agnesMediaDecision({
  durationSeconds: 6.041667,
  videoBytes: new Uint8Array(),
  imageBytes: jpeg.byteLength,
  imageWidth: 720,
  imageHeight: 1280,
});
assert(decision.ok, 'bby media decision');
const imagineBackends = {
  selected: 'imagine',
  imagine: { configured: true, publicOrigin: 'https://swaystill.com' },
  agnes: { configured: true, publicOrigin: 'https://swaystill.com' },
};
assert(selectRemakeProvider(imagineBackends, decision).provider === 'imagine', 'imagine selected');
assert(selectRemakeProvider({ ...imagineBackends, imagine: { configured: false, publicOrigin: 'https://swaystill.com' } }, decision).reason === 'xai_unset', 'missing key');
assert(selectRemakeProvider({ ...imagineBackends, imagine: { configured: false } }, decision).provider === 'imagine', 'missing key does not switch');
assert(
  selectRemakeProvider({ selected: 'agnes', agnes: imagineBackends.agnes, imagine: { configured: true } }, decision).provider === 'agnes',
  'agnes stays selected when the xai key exists',
);
assert(plannedReferenceImages(getTemplate('tiny-desk'), 'imagine').length === 5, 'tiny desk photos');
assert(plannedReferenceImages(getTemplate('bby-wow'), 'imagine').length === 1, 'bby photo');
assert(IMAGINE_MAX_REFERENCE_IMAGES === 14, 'reference cap');

assert(imagineDuration(6) === 6, '6s stays');
assert(imagineDuration(12) === 12, '12s stays');
assert(imagineDuration(16) === 15, 'duration cap');
assert(imagineDuration(0.2) === 1, 'duration floor');
assert(citeImagineImages('Use <Image 1> and <Image 5>. Keep 0-3s.') === 'Use <IMAGE_0> and <IMAGE_4>. Keep 0-3s.', 'token map');

const onePet = [{ roleId: 'lead', url: 'https://swaystill.com/pet/1.jpg', label: 'the grey cat' }];
const band = [
  { roleId: 'lead', url: 'https://swaystill.com/pet/1.jpg', label: 'the seal-point Siamese', appearance: { breed: 'Siamese cat', colors: ['seal-point'] } },
  { roleId: 'keys', url: 'https://swaystill.com/pet/2.jpg', appearance: { breed: 'standard poodle', colors: ['apricot'] } },
  { roleId: 'left-backup', url: 'https://swaystill.com/pet/3.jpg', appearance: { breed: 'pug', colors: ['black'] } },
  { roleId: 'right-backup', url: 'https://swaystill.com/pet/4.jpg', appearance: { breed: 'calico cat' } },
  { roleId: 'sax', url: 'https://swaystill.com/pet/5.jpg', appearance: { breed: 'wheaten terrier' } },
];

const bbyOne = await adaptPack(bby, onePet);
const bbyPayload = formatImagineCreatePayload(bbyOne, bbyOne.segments[0].id);
assert(bbyPayload.notSent === true, 'formatter does not send');
assert(bbyPayload.create.method === 'POST', 'create method');
assert(bbyPayload.create.url === 'https://api.x.ai/v1/videos/generations', bbyPayload.create.url);
assert(bbyPayload.create.body.model === IMAGINE_MODEL, bbyPayload.create.body.model);
assert(bbyPayload.create.body.model !== 'grok-imagine-video-1.5-lite', 'lite model');
assert(bbyPayload.create.body.aspect_ratio === '9:16', 'aspect');
assert(bbyPayload.create.body.resolution === '720p', 'resolution');
assert(bbyPayload.create.body.duration === 6, `bby duration ${bbyPayload.create.body.duration}`);
assert(bbyPayload.create.body.reference_images.length === 1, 'one reference');
assert(bbyPayload.create.body.reference_images[0].url === 'https://swaystill.com/pet/1.jpg', 'lead url');
assert(!('video' in bbyPayload.create.body) && !('videos' in bbyPayload.create.body), 'no template video field');
assert(!('image' in bbyPayload.create.body) && !('keyframes' in bbyPayload.create.body), 'no pinned frame');
assert(!JSON.stringify(bbyPayload.create.body).includes('.mp4'), 'no video url in the body');
assert(bbyPayload.create.body.prompt.includes('<IMAGE_0>'), 'image citation');
assert(!/<Image \d+>/.test(bbyPayload.create.body.prompt), 'pack token left in the prompt');
assert(/Locked medium close-up/.test(bbyPayload.create.body.prompt) && /packed nightclub/i.test(bbyPayload.create.body.prompt), 'shot structure kept');
assert(/No human faces and no human hands/.test(bbyPayload.create.body.prompt), 'pet-only pack line kept');
assert(!/\bperson\b/i.test(bbyPayload.create.body.prompt), bbyPayload.create.body.prompt);

const fanOne = await adaptPack(fan, onePet);
const fanFirst = formatImagineCreatePayload(fanOne, fanOne.segments[0].id);
const fanSecond = formatImagineCreatePayload(fanOne, fanOne.segments[1].id);
assert(fanFirst.create.body.duration === 8 && fanSecond.create.body.duration === 7, 'fan split durations');
assert(!fanFirst.create.body.video && !fanSecond.create.body.videos, 'fan has no video');
assert(/ceiling-fan blades/i.test(fanFirst.create.body.prompt), 'fan shot kept');
for (const term of STALE) {
  const text = `${fanFirst.create.body.prompt}\n${fanSecond.create.body.prompt}`.toLowerCase();
  assert(!text.includes(term.toLowerCase()), `fan ${term}`);
}

const fullBand = await adaptPack(tiny, band);
const bandText = fullBand.segments.map((segment) => segment.prompt).join('\n');
for (const term of STALE) assert(!bandText.toLowerCase().includes(term.toLowerCase()), `adapt ${term}`);
const tinyFirst = formatImagineCreatePayload(fullBand, fullBand.segments[0].id);
const tinySecond = formatImagineCreatePayload(fullBand, fullBand.segments[1].id);
assert(tinyFirst.create.body.duration === 12 && tinySecond.create.body.duration === 6, 'tiny desk split');
assert(tinyFirst.create.body.reference_images.length === 5, 'five references');
assert(tinySecond.create.body.reference_images.length === 5, 'second segment keeps every photo');
assert(tinySecond.create.body.reference_images[0].url.endsWith('/pet/1.jpg'), 'lead stays in slot 0');
assert(!tinySecond.create.body.prompt.includes('<IMAGE_0>'), 'segment 2 does not invent a lead cue');
assert(tinySecond.create.body.prompt.includes('<IMAGE_4>'), 'sax stays IMAGE_4');
for (let index = 0; index < 5; index += 1) {
  assert(tinyFirst.create.body.prompt.includes(`<IMAGE_${index}>`), `missing IMAGE_${index}`);
}
assert(!/<Image \d+>/.test(tinyFirst.create.body.prompt), 'unmapped token');
assert(/0-3s/.test(tinyFirst.create.body.prompt) && /6-9s/.test(tinyFirst.create.body.prompt), 'tiny timecodes');
const cited = `${tinyFirst.create.body.prompt}\n${tinySecond.create.body.prompt}`;
for (const term of STALE) assert(!cited.toLowerCase().includes(term.toLowerCase()), `cited ${term}`);
assert(/No human faces and no human hands/.test(cited), 'band pet-only line');

const solo = await adaptPack(tiny, onePet);
const soloText = solo.segments.map((segment) => segment.prompt).join('\n');
for (const term of STALE) assert(!soloText.toLowerCase().includes(term.toLowerCase()), `solo ${term}`);
const soloPayload = formatImagineCreatePayload(solo, solo.segments[0].id);
assert(soloPayload.create.body.reference_images.length === 1, 'solo image count');
assert(soloPayload.create.body.prompt.includes('<IMAGE_0>'), 'solo citation');
assert(!soloPayload.create.body.prompt.includes('<IMAGE_1>'), 'solo did not invent a second image');
assert(solo.segments.map((segment) => segment.promptSeconds).join() === '12,6', 'solo split stays');

const capped = structuredClone(bbyOne);
capped.segments[0].promptSeconds = 16;
assert(formatImagineCreatePayload(capped, capped.segments[0].id).create.body.duration === 15, 'payload duration cap');

const tooMany = {
  segments: [{ id: 'segment-1', prompt: '<Image 1>', promptSeconds: 6 }],
  roles: Array.from({ length: 15 }, (_, index) => ({
    roleId: `pet-${index}`,
    status: 'filled',
    deliveryToken: `<Image ${index + 1}>`,
    image: { url: `https://swaystill.com/pet/${index + 1}.jpg` },
  })),
};
const overflow = formatImagineCreatePayload(tooMany, 'segment-1');
assert(overflow.create.body.reference_images.length === 0, '15 images were sent');
assert(overflow.warnings.join(' ').includes('14'), overflow.warnings.join(' '));

const shaped = buildImagineRequest(runtime(), {
  imageUrls: tinyFirst.create.body.reference_images.map((item) => item.url),
  prompt: tinyFirst.create.body.prompt,
  duration: tinyFirst.create.body.duration,
});
assert(shaped.url === 'https://api.x.ai/v1/videos/generations', shaped.url);
assert(shaped.headers.Authorization === `Bearer ${XAI_KEY}`, 'auth');
assert(shaped.body.model === IMAGINE_MODEL, shaped.body.model);
assert(shaped.body.resolution === '720p' && shaped.body.aspect_ratio === '9:16', 'shape');
assert(shaped.body.duration === 12, 'shaped duration');
assert(shaped.body.reference_images.length === 5, 'shaped count');
assert(!('video' in shaped.body) && !('videos' in shaped.body) && !('seconds' in shaped.body), 'no agnes or video fields');
let rejectedVideo = false;
try {
  buildImagineRequest(runtime(), {
    imageUrls: ['https://swaystill.com/pet/1.jpg'],
    prompt: '<IMAGE_0> the pet',
    duration: 6,
    videoUrl: 'https://swaystill.com/brand/templates/bby-wow-demo.mp4',
  });
} catch (err) {
  rejectedVideo = err && err.code === 'imagine_bad_prompt';
}
assert(rejectedVideo, 'template video was accepted');
let missingKey = false;
try {
  buildImagineRequest(imagineRuntime({ PUBLIC_SITE_APEX: 'swaystill.com' }), {
    imageUrls: ['https://swaystill.com/pet/1.jpg'],
    prompt: '<IMAGE_0> the pet',
    duration: 6,
  });
} catch (err) {
  missingKey = err && err.code === 'xai_unset';
}
assert(missingKey, 'request without a key');
let lite = false;
try {
  buildImagineRequest({ ...runtime(), model: 'grok-imagine-video-1.5-lite' }, {
    imageUrls: ['https://swaystill.com/pet/1.jpg'],
    prompt: '<IMAGE_0> the pet',
    duration: 6,
  });
} catch (err) {
  lite = err && err.code === 'imagine_bad_model';
}
assert(lite, 'lite model was allowed');
let tooManyUrls = false;
try {
  buildImagineRequest(runtime(), {
    imageUrls: Array.from({ length: 15 }, (_, index) => `https://swaystill.com/pet/${index + 1}.jpg`),
    prompt: '<IMAGE_0>',
    duration: 6,
  });
} catch (err) {
  tooManyUrls = err && err.code === 'imagine_unreachable_input';
}
assert(tooManyUrls, '15 urls were accepted');

const packed = packImagineTaskId('a3d1008e-4544-40d4-d075-11527e794e4a');
assert(packed.startsWith('xai_'), packed);
assert(unpackImagineTaskId(packed).requestId === 'a3d1008e-4544-40d4-d075-11527e794e4a', 'unpack one');
assert(unpackAgnesTaskId(packed) == null, 'agnes unpack claimed an imagine id');
const pair = packImagineTaskSet(['a3d1008e-4544-40d4-d075-11527e794e4a', 'b3d1008e-4544-40d4-d075-11527e794e4b']);
const unpacked = unpackImagineTaskId(pair);
assert(unpacked.parallel && unpacked.count === 2 && unpacked.slots[1].startsWith('b3d1008e'), JSON.stringify(unpacked));

function wrap(sqlite) {
  function prepared(sql, params = []) {
    return {
      bind(...next) {
        return prepared(sql, next);
      },
      async run() {
        const info = sqlite.prepare(sql).run(...params);
        return { meta: { changes: info.changes } };
      },
      async first() {
        return sqlite.prepare(sql).get(...params) ?? null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...params) };
      },
    };
  }
  return {
    prepare(sql) {
      return prepared(sql);
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const stmt of statements) out.push(await stmt.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

function mockBucket() {
  const objects = new Map();
  return {
    async put(key, value) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      objects.set(key, bytes);
    },
    async get(key) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      const copy = new Uint8Array(bytes);
      return { body: copy, arrayBuffer: async () => copy.buffer };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

const sqlite = new DatabaseSync(':memory:');
const db = wrap(sqlite);
await ensureSchema(db);
const bucket = mockBucket();
const user = { user_id: 'u_imagine', email: 'imagine-user@example.com', name: 'Imagine User' };
const requestOrigin = 'https://viral-templates.pages.dev';
const baseEnv = {
  DB: db,
  MEDIA: bucket,
  AUTH_SECRET: 'media-test-secret-1',
  PUBLIC_SITE_APEX: 'swaystill.com',
  AGNES_API_KEY: AGNES_KEY,
  BAILIAN_API_KEY: 'sk-test-bailian-key',
  JOB_PROCESS_SECRET: 'job-process-secret-1',
};
await appendLedger(db, user, { delta: 500, kind: 'topup', label_en: 'Test pack', label_zh: '测试包' });

function photo(count) {
  return Array.from({ length: count }, () => ({ bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' }));
}

async function queue(slug, count) {
  return queueJobWithMedia({
    db,
    env: baseEnv,
    request: new Request(`${requestOrigin}/api/jobs`, { method: 'POST' }),
    user,
    templateSlug: slug,
    photos: photo(count),
    petsOnly: true,
  });
}

const closedCalls = [];
const closed = await queue('bby-wow', 1);
const closedRun = await processRemakeJobs({
  db,
  env: { ...baseEnv, VIDEO_PROVIDER: 'imagine' },
  request: new Request(`${requestOrigin}/api/jobs/process`, { method: 'POST' }),
  fetchImpl(url) {
    closedCalls.push(String(url));
    throw new Error(`provider was called ${url}`);
  },
  jobId: closed.job.id,
});
assert(closedRun.processed[0].status === 'failed', JSON.stringify(closedRun.processed[0]));
assert(closedRun.processed[0].error === 'xai_unset', closedRun.processed[0].error);
assert(closedCalls.length === 0, `fail-closed called ${closedCalls.join(' ')}`);
const closedRow = sqlite.prepare(`SELECT status, error_code, note_en FROM jobs WHERE id = ?`).get(closed.job.id);
assert(closedRow.status === 'failed' && closedRow.error_code === 'xai_unset', JSON.stringify(closedRow));
assert(!/agnes|bailian|waffo|grok|xai|imagine/i.test(closedRow.note_en), closedRow.note_en);
const refunded = await getCredits(db, user);
assert(refunded.balance === 500, `closed balance ${refunded.balance}`);
assert(
  refunded.ledger.filter((row) => row.job_id === closed.job.id).map((row) => row.kind).sort().join() === 'deduction,refund',
  'closed refund',
);

const calls = [];
const files = new Map();
let requestSerial = 0;
async function fetchImpl(url, init = {}) {
  const href = String(url);
  calls.push({ url: href, init });
  if (href.includes('api.agnes-ai.cn') || href.includes('dashscope') || href.includes('/brand/templates/')) {
    throw new Error(`unexpected provider call ${href}`);
  }
  if (href === 'https://api.x.ai/v1/videos/generations') {
    const body = JSON.parse(init.body || '{}');
    requestSerial += 1;
    const id = `a3d1008e-4544-40d4-d075-11527e79${String(requestSerial).padStart(4, '0')}`;
    const file = body.duration === 6 && body.reference_images.length === 5 ? piece1 : piece0;
    files.set(id, file);
    return jsonResponse(200, { request_id: id });
  }
  if (href.startsWith('https://api.x.ai/v1/videos/')) {
    const id = href.slice('https://api.x.ai/v1/videos/'.length);
    return jsonResponse(200, {
      status: 'done',
      model: IMAGINE_MODEL,
      video: { url: `https://vidgen.x.ai/${id}.mp4`, duration: 6, respect_moderation: true },
    });
  }
  if (href.startsWith('https://vidgen.x.ai/')) {
    const id = href.slice('https://vidgen.x.ai/'.length).replace(/\.mp4$/, '');
    const body = files.get(id);
    if (!body) throw new Error(`missing video ${href}`);
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'video/mp4', 'content-length': String(body.byteLength) },
    });
  }
  throw new Error(`unexpected fetch ${href}`);
}

const imagineEnv = { ...baseEnv, VIDEO_PROVIDER: 'imagine', XAI_API_KEY: XAI_KEY };
async function run(jobId) {
  return processRemakeJobs({
    db,
    env: imagineEnv,
    request: new Request(`${requestOrigin}/api/jobs/process`, { method: 'POST' }),
    fetchImpl,
    jobId,
  });
}

function createBodies() {
  return calls
    .filter((call) => call.url === 'https://api.x.ai/v1/videos/generations' && call.init.method === 'POST')
    .map((call) => JSON.parse(call.init.body));
}

const bbyJob = await queue('bby-wow', 1);
const bbyStart = await run(bbyJob.job.id);
assert(bbyStart.provider.name === 'imagine', JSON.stringify(bbyStart.provider));
assert(bbyStart.provider.model === IMAGINE_MODEL, bbyStart.provider.model);
assert(bbyStart.provider.base_host === 'api.x.ai', bbyStart.provider.base_host);
assert(bbyStart.processed[0].status === 'running' && bbyStart.processed[0].provider === 'imagine', JSON.stringify(bbyStart.processed[0]));
const bbyBody = createBodies().at(-1);
assert(bbyBody.model === IMAGINE_MODEL, bbyBody.model);
assert(bbyBody.duration === 6 && bbyBody.aspect_ratio === '9:16' && bbyBody.resolution === '720p', JSON.stringify(bbyBody));
assert(bbyBody.reference_images.length === 1, 'live bby image count');
assert(new URL(bbyBody.reference_images[0].url).origin === 'https://swaystill.com', 'signed origin');
assert(new URL(bbyBody.reference_images[0].url).pathname.endsWith('/photo'), 'photo kind');
assert(bbyBody.prompt.includes('<IMAGE_0>') && !/<Image \d+>/.test(bbyBody.prompt), 'live citation');
assert(/Locked medium close-up/.test(bbyBody.prompt) && /packed nightclub/i.test(bbyBody.prompt), 'live shot');
assert(/No human faces and no human hands/.test(bbyBody.prompt), 'live pet-only line');
assert(!('video' in bbyBody) && !('videos' in bbyBody) && !JSON.stringify(bbyBody).includes('.mp4'), 'live body has a video');
assert(!JSON.stringify(bbyBody).includes(XAI_KEY), 'key leaked into the body');
const bbyReady = await run(bbyJob.job.id);
assert(bbyReady.processed[0].status === 'ready', JSON.stringify(bbyReady.processed[0]));
assert(calls.some((call) => call.url.startsWith('https://vidgen.x.ai/')), 'downloaded the temporary video');
const bbyRow = sqlite.prepare(`SELECT status, provider_task_id, note_en FROM jobs WHERE id = ?`).get(bbyJob.job.id);
assert(bbyRow.status === 'ready' && String(bbyRow.provider_task_id).startsWith('xai_'), JSON.stringify(bbyRow));
assert(!/agnes|bailian|waffo|grok|xai|imagine/i.test(bbyRow.note_en), bbyRow.note_en);
const afterBby = await getCredits(db, user);
assert(afterBby.balance === 494, `bby balance ${afterBby.balance}`);
assert(afterBby.ledger.filter((row) => row.job_id === bbyJob.job.id).map((row) => row.kind).join() === 'deduction', 'bby charged once');

const beforeTiny = createBodies().length;
const tinyJob = await queue('tiny-desk', 5);
const tinyStart = await run(tinyJob.job.id);
assert(tinyStart.processed[0].status === 'running' && tinyStart.processed[0].provider === 'imagine', JSON.stringify(tinyStart.processed[0]));
const tinyBodies = createBodies().slice(beforeTiny);
assert(tinyBodies.length === 2, `tiny creates ${tinyBodies.length}`);
assert(tinyBodies.map((body) => body.duration).sort((a, b) => a - b).join() === '6,12', JSON.stringify(tinyBodies.map((body) => body.duration)));
for (const body of tinyBodies) {
  assert(body.model === IMAGINE_MODEL && body.resolution === '720p' && body.aspect_ratio === '9:16', JSON.stringify(body));
  assert(body.reference_images.length === 5, 'tiny reference count');
  assert(!('video' in body) && !('videos' in body) && !('image' in body), 'tiny attached video or a pinned frame');
  assert(!JSON.stringify(body).includes('/brand/templates/'), 'tiny sent a template path');
  assert(!/<Image \d+>/.test(body.prompt), 'live pack token');
  assert(/<IMAGE_\d+>/.test(body.prompt), 'live citation');
  for (const term of STALE) assert(!body.prompt.toLowerCase().includes(term.toLowerCase()), `live ${term}`);
}
const tinyReady = await run(tinyJob.job.id);
assert(tinyReady.processed[0].status === 'ready', JSON.stringify(tinyReady.processed[0]));
const tinyRow = sqlite.prepare(`SELECT provider_task_id, note_en FROM jobs WHERE id = ?`).get(tinyJob.job.id);
assert(String(tinyRow.provider_task_id).startsWith('xi2_'), tinyRow.provider_task_id);
assert(!/agnes|bailian|waffo|grok|xai|imagine/i.test(tinyRow.note_en), tinyRow.note_en);
const afterTiny = await getCredits(db, user);
assert(afterTiny.balance === 476, `tiny balance ${afterTiny.balance}`);

const agnesCalls = [];
async function agnesFetch(url, init = {}) {
  const href = String(url);
  agnesCalls.push({ url: href, init });
  if (href.startsWith('https://api.x.ai/')) throw new Error(`agnes path called xai ${href}`);
  if (href.startsWith('https://api.agnes-ai.cn/v1/videos')) {
    return jsonResponse(200, { video_id: 'task_agnesimagine01', status: 'queued' });
  }
  throw new Error(`unexpected agnes fetch ${href}`);
}
const agnesJob = await queue('bby-wow', 1);
const agnesRun = await processRemakeJobs({
  db,
  env: { ...baseEnv, VIDEO_PROVIDER: 'agnes', XAI_API_KEY: XAI_KEY },
  request: new Request(`${requestOrigin}/api/jobs/process`, { method: 'POST' }),
  fetchImpl: agnesFetch,
  jobId: agnesJob.job.id,
});
assert(agnesRun.provider.name === 'agnes', JSON.stringify(agnesRun.provider));
assert(agnesRun.processed[0].provider === 'agnes' && agnesRun.processed[0].status === 'running', JSON.stringify(agnesRun.processed[0]));
const agnesBody = JSON.parse(agnesCalls.find((call) => call.url.startsWith('https://api.agnes-ai.cn/v1/videos')).init.body);
assert(agnesBody.model === 'agnes-video-2.5', agnesBody.model);
assert(agnesBody.seconds === '6' && !agnesBody.videos, 'agnes image-only body changed');
assert(!agnesCalls.some((call) => call.url.includes('api.x.ai')), 'agnes job called xai');

console.log('imagine tests passed');
