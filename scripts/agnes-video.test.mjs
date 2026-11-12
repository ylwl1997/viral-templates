import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { appendLedger, getCredits } from '../functions/_lib/account-db.js';
import {
  AGNES_MAX_REFERENCE_IMAGES,
  AGNES_MODEL,
  AGNES_VIDEO_MAX_BYTES,
  DEFAULT_AGNES_BASE,
  REFERENCE_PROMPT,
  agnesInputUrls,
  agnesMediaDecision,
  agnesOutputSeconds,
  agnesPollDelayMs,
  agnesPollUrl,
  assertAgnesInputUrl,
  buildReferenceRequest,
  customMediaOrigin,
  packAgnesTaskSet,
  planAgnesSegments,
  probeReferenceMp4,
  referencePrompt,
  unpackAgnesTaskId,
} from '../functions/_lib/agnes.js';
import { concatMp4, cutReferenceMp4 } from '../functions/_lib/mp4-segments.js';
import { onRequestPost as onContinue } from '../functions/api/jobs/continue.js';
import { issueSessionCookie } from '../functions/_lib/session.js';
import { probeImage } from '../functions/_lib/image-precheck.js';
import { queueJobWithMedia } from '../functions/_lib/job-media.js';
import { ensureSchema } from '../functions/_lib/account-db.js';
import { processRemakeJobs } from '../functions/_lib/bailian-worker.js';
import bbyWowPack from '../packages/template-pipeline/packs/bby-wow-pets/pack.json' with { type: 'json' };
import { adaptPack, parseTemplatePack } from '../packages/template-pipeline/dist/index.js';
import { getTemplate, TEMPLATE_CATALOG } from '../functions/_lib/templates.js';
import { plannedReferenceImages, resolveVideoProvider, selectRemakeProvider } from '../functions/_lib/video-provider.js';
import { CLASSIC_DASHSCOPE_BASE } from '../functions/_lib/bailian.js';

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function pad(bytes, length = 32) {
  const out = new Uint8Array(length);
  out.set(bytes);
  return out;
}

const jpeg = probeImage('jpeg', 720, 1280);
const mp4 = pad(Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]));
const AGNES_KEY = 'agnes-test-key-not-real';
const BAILIAN_KEY = 'sk-test-bailian-key';
assert(resolveVideoProvider({}) === 'agnes', 'default provider');
assert(resolveVideoProvider({ VIDEO_PROVIDER: 'agnes' }) === 'agnes', 'explicit agnes');
assert(resolveVideoProvider({ VIDEO_PROVIDER: 'bailian' }) === 'bailian', 'explicit bailian');
let badProvider = false;
try {
  resolveVideoProvider({ VIDEO_PROVIDER: 'kling' });
} catch (err) {
  badProvider = err && err.code === 'video_provider';
}
assert(badProvider, 'unknown provider');

assert(agnesOutputSeconds(6.041667) === '6', 'bby seconds');
assert(agnesOutputSeconds(getTemplate('kiss-cam').durationSeconds) === '6', 'kiss seconds');
assert(agnesOutputSeconds(15.278005) === null, 'fan is not trimmed to 12');
assert(agnesOutputSeconds(12) === '12', '12s stays');
assert(agnesOutputSeconds(12.01) === null, 'just over 12 falls back');
assert(agnesOutputSeconds(1.9) === null, 'under 2 falls back');
assert(agnesOutputSeconds(2.2) === '4', 'short reference requests the minimum output');
assert(agnesOutputSeconds(3.6) === '4', '3.6 rounds to 4');

let delay = 0;
const delays = [];
for (let i = 0; i < 6; i += 1) {
  delay = agnesPollDelayMs(delay);
  delays.push(delay);
}
assert(delays.join(',') === '6000,12000,24000,48000,60000,60000', delays.join(','));

assert(customMediaOrigin({ PUBLIC_SITE_APEX: 'swaystill.com' }) === 'https://swaystill.com', 'apex origin');
assert(customMediaOrigin({ PUBLIC_SITE_APEX: 'https://swaystill.com/path' }) === 'https://swaystill.com', 'apex strips path');
assert(customMediaOrigin({ PUBLIC_SITE_APEX: 'viral-templates.pages.dev' }) === '', 'pages.dev is not a public input origin');
assert(customMediaOrigin({}) === '', 'missing apex');
for (const blocked of [
  'https://viral-templates.pages.dev/brand/templates/bby-wow-demo.mp4',
  'https://swaystill.pages.dev/clip.mp4',
  'https://job.workers.dev/clip.mp4',
  'https://pub-abc.r2.dev/clip.mp4',
  'http://swaystill.com/brand/templates/bby-wow-demo.mp4',
  'https://user:pass@swaystill.com/brand/templates/bby-wow-demo.mp4',
  'https://evil.example/brand/templates/bby-wow-demo.mp4',
]) {
  let refused = false;
  try {
    assertAgnesInputUrl(blocked, 'https://swaystill.com');
  } catch (err) {
    refused = err && err.code === 'agnes_unreachable_input';
  }
  assert(refused, `accepted ${blocked}`);
}
assert(
  assertAgnesInputUrl('https://bby-wow.swaystill.com/brand/templates/bby-wow-demo.mp4', 'https://swaystill.com').includes('bby-wow.swaystill.com'),
  'keyword host',
);

const shaped = buildReferenceRequest(
  {
    apiKey: AGNES_KEY,
    base: DEFAULT_AGNES_BASE,
    model: AGNES_MODEL,
    publicOrigin: 'https://swaystill.com',
  },
  {
    imageUrl: 'https://swaystill.com/api/media/jobs/job_abc/photo?exp=1&sig=ab',
    videoUrl: 'https://swaystill.com/brand/templates/bby-wow-demo.mp4',
    seconds: '6',
  },
);
assert(shaped.url === 'https://api.agnes-ai.cn/v1/videos', shaped.url);
assert(shaped.headers.Authorization === `Bearer ${AGNES_KEY}`, 'bearer');
assert(shaped.body.model === 'agnes-video-2.5', shaped.body.model);
assert(shaped.body.mode === 'reference', shaped.body.mode);
assert(shaped.body.seconds === '6', shaped.body.seconds);
assert(typeof shaped.body.seconds === 'string', 'seconds is a string');
assert(shaped.body.size === '720P', shaped.body.size);
assert(shaped.body.aspect_ratio === '9:16', shaped.body.aspect_ratio);
assert(shaped.body.images.length === 1, 'one image');
assert(shaped.body.videos.length === 1, 'one video');
assert(shaped.body.videos[0].start_seconds === 0, 'start');
assert(shaped.body.videos[0].require_audio === false, 'audio optional');
assert(shaped.body.prompt === REFERENCE_PROMPT, shaped.body.prompt);
assert(shaped.body.prompt.includes('<Image 1>') && shaped.body.prompt.includes('<Video 1>'), 'placeholders');
assert(!shaped.body.prompt.includes('<Image 2>'), 'one-photo prompt names a second image');
assert(!JSON.stringify(shaped.body).includes(AGNES_KEY), 'key in body');
assert(!shaped.body.first_frame && !shaped.body.video_url, 'legacy media fields');
assert(
  agnesPollUrl({ base: DEFAULT_AGNES_BASE, model: AGNES_MODEL }, 'task_bbywow0001') ===
    'https://api.agnes-ai.cn/agnesapi?video_id=task_bbywow0001&model_name=agnes-video-2.5',
  'poll url',
);

const kissTemplate = getTemplate('kiss-cam');
const pairPrompt = referencePrompt(kissTemplate);
const pairShaped = buildReferenceRequest(
  {
    apiKey: AGNES_KEY,
    base: DEFAULT_AGNES_BASE,
    model: AGNES_MODEL,
    publicOrigin: 'https://swaystill.com',
  },
  {
    imageUrls: [
      'https://swaystill.com/api/media/jobs/job_abc/photo?exp=1&sig=ab',
      'https://swaystill.com/api/media/jobs/job_abc/photo-2?exp=1&sig=cd',
    ],
    videoUrl: 'https://swaystill.com/brand/templates/kiss-cam-demo.mp4',
    seconds: '6',
    prompt: pairPrompt,
  },
);
assert(pairShaped.body.images.length === 2, 'pair image count');
assert(new URL(pairShaped.body.images[0]).pathname.endsWith('/photo'), 'pair image 1 path');
assert(new URL(pairShaped.body.images[1]).pathname.endsWith('/photo-2'), 'pair image 2 path');
assert(pairShaped.body.prompt.includes('<Image 1>') && pairShaped.body.prompt.includes('<Image 2>'), 'pair placeholders');
assert(pairShaped.body.prompt.includes('both pets'), 'pair replaces both');
assert(pairShaped.body.prompt.includes('Photo A') && pairShaped.body.prompt.includes('Photo B'), 'pair slot labels');
assert(pairShaped.body.prompt.includes('the pet on the left') && pairShaped.body.prompt.includes('the pet on the right'), 'pair roles');
assert(pairShaped.body.prompt !== REFERENCE_PROMPT, 'pair kept the one-pet prompt');
assert(!pairShaped.body.prompt.includes('Use <Image 1> as the pet and follow'), 'pair singular prompt');
assert(pairShaped.body.videos.length === 1, 'pair still one video');

const uiSource = fs.readFileSync(new URL('../src/lib/templates.ts', import.meta.url), 'utf8');
const uiCounts = new Map();
for (const match of uiSource.matchAll(/slug:\s*'([^']+)'[\s\S]*?photoCount:\s*(\d+)/g)) {
  uiCounts.set(match[1], Number(match[2]));
}
const publicCatalog = Object.entries(TEMPLATE_CATALOG).filter(([, row]) => !row.retired && !row.internal);
assert(uiCounts.size === publicCatalog.length, `ui catalog ${uiCounts.size}`);
assert(TEMPLATE_CATALOG['kiss-cam'].retired === true, 'kiss cam retired');
assert(!uiSource.includes("slug: 'kiss-cam'"), 'kiss cam still has a public page');
const signEnv = { AUTH_SECRET: 'media-test-secret-1', PUBLIC_SITE_APEX: 'swaystill.com' };
for (const [slug, row] of publicCatalog) {
  const template = getTemplate(slug);
  assert(uiCounts.get(slug) === row.photoCount, `${slug} ui photoCount`);
  assert(template.photoCount === row.photoCount, `${slug} worker photoCount`);
  const kinds = plannedReferenceImages(template, 'agnes');
  assert(
    kinds && kinds.length === row.photoCount && kinds.length <= AGNES_MAX_REFERENCE_IMAGES,
    `${slug} photoCount ${row.photoCount} but the primary path would send ${kinds ? kinds.length : 0}`,
  );
  const prompt = referencePrompt(template);
  if (row.photoCount === 1) {
    assert(prompt === REFERENCE_PROMPT, `${slug} one-photo prompt`);
    assert(!prompt.includes('<Image 2>'), `${slug} names a second image`);
  } else {
    assert(prompt !== REFERENCE_PROMPT, `${slug} shipped the one-person prompt`);
    assert(prompt.includes('both pets') || prompt.includes('every pet'), `${slug} prompt`);
    assert(!prompt.includes('Use <Image 1> as the pet and follow'), `${slug} singular prompt`);
    for (let index = 1; index <= row.photoCount; index += 1) {
      assert(prompt.includes(`<Image ${index}>`), `${slug} image ${index}`);
    }
    assert(template.photoSlots && template.photoSlots.length === row.photoCount, `${slug} slots`);
    for (const slot of template.photoSlots) {
      assert(prompt.includes(slot.labelEn) && prompt.includes(slot.replacesEn), `${slug} slot meaning`);
    }
    assert(plannedReferenceImages(template, 'bailian') == null, `${slug} mix would accept a photo it cannot send`);
  }
  if (!template.referenceVideo) continue;
  const signed = await agnesInputUrls(signEnv, 'job_catalogcheck0001', template.referenceVideo, template.photoCount);
  assert(signed && signed.imageUrls.length === row.photoCount, `${slug} signed count`);
  signed.imageUrls.forEach((url, index) => {
    const parsed = new URL(url);
    assert(parsed.origin === 'https://swaystill.com', `${slug} signed origin`);
    assert(parsed.pathname.endsWith(`/${kinds[index]}`), `${slug} signed kind ${index}`);
    assert(parsed.searchParams.has('exp') && parsed.searchParams.has('sig'), `${slug} signed query`);
    assert(!/pages\.dev|workers\.dev|r2\.dev/.test(parsed.hostname), `${slug} blocked host`);
  });
}

const image = { imageBytes: jpeg.byteLength, imageWidth: 720, imageHeight: 1280 };
const bbyDecision = agnesMediaDecision({ durationSeconds: 6.041667, videoBytes: mp4, ...image });
assert(bbyDecision.ok && bbyDecision.seconds === '6' && bbyDecision.segments.length === 1, JSON.stringify(bbyDecision));
const fanDecision = agnesMediaDecision({ durationSeconds: 15.278005, videoBytes: mp4, ...image });
assert(fanDecision.ok && fanDecision.reason === 'split' && fanDecision.segments.length === 2, JSON.stringify(fanDecision));
for (const segment of fanDecision.segments) {
  const length = segment.end - segment.start;
  assert(length >= 4 && length <= 12, `fan piece ${length}`);
  assert(Number(segment.seconds) >= 4 && Number(segment.seconds) <= 12, segment.seconds);
}
assert(fanDecision.segments[0].seconds === '8' && fanDecision.segments[1].seconds === '8', JSON.stringify(fanDecision.segments));
assert(fanDecision.segments[1].end - fanDecision.segments[1].start >= 4, 'fan was split as 12 plus a short tail');
const evenFan = planAgnesSegments(15.278005, []);
assert(evenFan.length === 2, 'even split');
assert(Math.abs(evenFan[0].end - 15.278005 / 2) < 0.02, evenFan[0].end);
assert(planAgnesSegments(13, [1]) == null, 'a 1s keyframe cannot make two 4–12s pieces');
const long = planAgnesSegments(25, []);
assert(long.length === 3, `25s pieces ${long && long.length}`);
assert(long.every((segment) => segment.end - segment.start >= 4 && segment.end - segment.start <= 12), '25s pieces out of range');
const stubDecision = agnesMediaDecision({ durationSeconds: 15.278005, videoBytes: mp4, ...image });
assert(stubDecision.ok && stubDecision.segments.length === 2, 'catalog duration still plans a split when the file has no header');
const sizeDecision = agnesMediaDecision({
  durationSeconds: 6,
  videoBytes: { byteLength: AGNES_VIDEO_MAX_BYTES },
  ...image,
});
assert(!sizeDecision.ok && sizeDecision.reason === 'size', sizeDecision.reason);
const wideDecision = agnesMediaDecision({
  durationSeconds: 6,
  videoBytes: mp4,
  imageBytes: 1000,
  imageWidth: 6000,
  imageHeight: 3000,
});
assert(!wideDecision.ok && wideDecision.reason === 'image_dimensions', wideDecision.reason);

const slow = syntheticClip({ fps: 20, seconds: 6 });
const slowDecision = agnesMediaDecision({ durationSeconds: 6, videoBytes: slow, ...image });
assert(probeReferenceMp4(slow).fps === 20, `synthetic fps ${probeReferenceMp4(slow).fps}`);
assert(!slowDecision.ok && slowDecision.reason === 'fps', JSON.stringify(slowDecision));

const agnesBackends = {
  selected: 'agnes',
  agnes: { configured: true, publicOrigin: 'https://swaystill.com' },
};
assert(selectRemakeProvider(agnesBackends, bbyDecision).provider === 'agnes', 'bby selects agnes');
assert(selectRemakeProvider(agnesBackends, fanDecision).provider === 'agnes', 'fan stays on the split path');
assert(selectRemakeProvider({ ...agnesBackends, agnes: { configured: false, publicOrigin: 'https://swaystill.com' } }, bbyDecision).reason === 'agnes_unset', 'missing key');
assert(
  selectRemakeProvider({ selected: 'agnes', agnes: { configured: true, publicOrigin: '' } }, bbyDecision).reason === 'public_origin',
  'pages host falls back',
);
assert(selectRemakeProvider({ selected: 'bailian', agnes: agnesBackends.agnes }, bbyDecision).provider === 'bailian', 'switch');

function u32(n) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
}

function box(type, payload) {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)], 4);
  out.set(payload, 8);
  return out;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function header(timescale, duration) {
  const payload = new Uint8Array(32);
  new DataView(payload.buffer).setUint32(12, timescale);
  new DataView(payload.buffer).setUint32(16, duration);
  return payload;
}

function syntheticClip({ fps, seconds }) {
  const samples = fps * seconds;
  const mdhd = header(fps, samples);
  const hdlr = new Uint8Array(24);
  hdlr.set([0x76, 0x69, 0x64, 0x65], 8);
  const stts = concat([new Uint8Array(4), u32(1), u32(samples), u32(1)]);
  const stbl = box('stbl', box('stts', stts));
  const minf = box('minf', stbl);
  const mdia = box('mdia', concat([box('mdhd', mdhd), box('hdlr', hdlr), minf]));
  const trak = box('trak', mdia);
  const mvhd = header(1000, seconds * 1000);
  return box('moov', concat([box('mvhd', mvhd), trak]));
}

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
    objects,
    async put(key, value, opts) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      objects.set(key, { bytes, opts });
    },
    async get(key) {
      const row = objects.get(key);
      if (!row) return null;
      return {
        key,
        body: row.bytes,
        size: row.bytes.byteLength,
        httpMetadata: (row.opts && row.opts.httpMetadata) || {},
        customMetadata: (row.opts && row.opts.customMetadata) || {},
      };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const policy = {
  data: {
    policy: 'policy',
    signature: 'sig',
    upload_dir: 'dashscope-instant/test/2026',
    upload_host: 'https://dashscope-file-mgr.oss-cn-beijing.aliyuncs.com',
    oss_access_key_id: 'LTAtest',
    x_oss_object_acl: 'private',
    x_oss_forbid_overwrite: 'true',
  },
};

const script = {
  create: 'ok',
  poll: 'completed',
  agnesPolls: 0,
  creates: 0,
  bailianTasks: 0,
};

function installFetch() {
  const calls = [];
  async function fetchImpl(url, init = {}) {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.includes('/brand/templates/') && href.endsWith('.mp4')) {
      return new Response(mp4, { status: 200, headers: { 'content-type': 'video/mp4' } });
    }
    if (href.startsWith('https://api.agnes-ai.cn/v1/videos')) {
      assert(init.method === 'POST', 'create method');
      assert((init.headers || {}).Authorization === `Bearer ${AGNES_KEY}`, 'create auth');
      script.creates += 1;
      const requestBody = JSON.parse(init.body || '{}');
      if (script.create === 'reject') return jsonResponse(400, { error: { message: 'Invalid reference media' } });
      if (script.create === 'rate' || (script.create === 'rate-8' && String(requestBody.seconds) === '8')) {
        return jsonResponse(429, { message: 'too many' });
      }
      if (script.create === 'reject-8' && String(requestBody.seconds) === '8') {
        return jsonResponse(400, { error: { message: 'Invalid reference media' } });
      }
      if (script.create === 'down') return jsonResponse(500, { message: `bad ${AGNES_KEY}` });
      const videoId = `task_bby${String(script.creates).padStart(6, '0')}`;
      return jsonResponse(200, {
        id: videoId,
        task_id: videoId,
        video_id: videoId,
        status: 'queued',
        internal_status: 'pending',
      });
    }
    if (href.startsWith('https://api.agnes-ai.cn/agnesapi')) {
      const pollUrl = new URL(href);
      assert(pollUrl.searchParams.get('model_name') === AGNES_MODEL, href);
      assert(String(pollUrl.searchParams.get('video_id') || '').startsWith('task_'), href);
      script.agnesPolls += 1;
      if (script.poll === 'rate' && script.agnesPolls === 1) return jsonResponse(429, { message: 'too many' });
      if (script.poll === 'hide') {
        return jsonResponse(200, {
          status: 'in_progress',
          internal_status: 'completed',
          url: 'https://cdn.example.com/hidden.mp4',
        });
      }
      if (script.poll === 'fail') {
        return jsonResponse(200, {
          status: 'failed',
          internal_status: 'pending',
          error: { message: `bad ${AGNES_KEY}` },
        });
      }
      return jsonResponse(200, {
        status: 'completed',
        internal_status: 'pending',
        url: 'https://cdn.example.com/out.mp4',
      });
    }
    if (href === 'https://cdn.example.com/out.mp4') {
      const body = script.downloads && script.downloads.length ? script.downloads.shift() : mp4;
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(body.byteLength) },
      });
    }
    if (href.includes('/uploads')) {
      if (href.includes('llm-g1ozpdi7y5eyp1mh')) return jsonResponse(404, { code: 'NotFound', message: 'no uploads' });
      assert(href.startsWith(CLASSIC_DASHSCOPE_BASE), href);
      return jsonResponse(200, policy);
    }
    if (href.includes('dashscope-file-mgr.oss-cn-beijing.aliyuncs.com')) {
      return new Response(null, { status: 200 });
    }
    if (href.includes('/services/aigc/image2video/video-synthesis')) {
      script.bailianTasks += 1;
      const taskId = `0385dc79-5ff8-4d82-bcb6-m${String(script.bailianTasks).padStart(6, '0')}`;
      return jsonResponse(200, { output: { task_id: taskId, task_status: 'PENDING' }, request_id: 'req_submit' });
    }
    if (href.includes('/tasks/')) {
      const taskId = href.split('/tasks/')[1];
      return jsonResponse(200, {
        output: {
          task_id: taskId,
          task_status: 'SUCCEEDED',
          results: { video_url: 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/out.mp4?Expires=1' },
        },
      });
    }
    if (href.includes('dashscope-result-bj.oss-cn-beijing.aliyuncs.com')) {
      return new Response(mp4, { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(mp4.byteLength) } });
    }
    throw new Error(`unexpected fetch ${href}`);
  }
  return { fetchImpl, calls };
}

function bitrateBoxes(bytes) {
  const found = [];
  for (let i = 0; i < bytes.length - 16; i += 1) {
    if (bytes[i] === 0x62 && bytes[i + 1] === 0x74 && bytes[i + 2] === 0x72 && bytes[i + 3] === 0x74) {
      found.push(Buffer.from(bytes.subarray(i, i + 16)).toString('hex'));
    }
  }
  return found.join(',');
}

function visualSample(bytes) {
  for (let i = 0; i < bytes.length - 48; i += 1) {
    if (bytes[i] !== 0x73 || bytes[i + 1] !== 0x74 || bytes[i + 2] !== 0x73 || bytes[i + 3] !== 0x64) continue;
    const type = String.fromCharCode(bytes[i + 16], bytes[i + 17], bytes[i + 18], bytes[i + 19]);
    if (type === 'avc1' || type === 'avc3') return i + 12;
  }
  return -1;
}

function sniffJoin(bytes) {
  return bytes instanceof Uint8Array && bytes.length > 32 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

function createBody(calls) {
  const call = calls.find((item) => item.url.startsWith('https://api.agnes-ai.cn/v1/videos') && item.init.method === 'POST');
  assert(call, 'missing create');
  return JSON.parse(call.init.body);
}

const sqlite = new DatabaseSync(':memory:');
const db = wrap(sqlite);
await ensureSchema(db);
const bucket = mockBucket();
const user = { user_id: 'u_agnes', email: 'agnes-user@example.com', name: 'Agnes User' };
const requestOrigin = 'https://viral-templates.pages.dev';
const env = {
  DB: db,
  MEDIA: bucket,
  ASSETS: {
    async fetch(request) {
      const href = String(request && request.url ? request.url : request);
      const body = mp4;
      return new Response(body, { status: 200, headers: { 'content-type': 'video/mp4' } });
    },
  },
  AUTH_SECRET: 'media-test-secret-1',
  PUBLIC_SITE_APEX: 'swaystill.com',
  AGNES_API_KEY: AGNES_KEY,
  BAILIAN_API_KEY: BAILIAN_KEY,
  JOB_PROCESS_SECRET: 'job-process-secret-1',
};
await appendLedger(db, user, { delta: 500, kind: 'topup', label_en: 'Test pack', label_zh: '测试包' });

async function queue(slug, photos) {
  return queueJobWithMedia({
    db,
    env,
    request: new Request(`${requestOrigin}/api/jobs`, { method: 'POST' }),
    user,
    templateSlug: slug,
    photos,
    petsOnly: true,
  });
}

const onePhoto = [{ bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' }];
const twoPhotos = [onePhoto[0], onePhoto[0]];
const { fetchImpl, calls } = installFetch();

async function run(jobId, nowMs = Date.now()) {
  return processRemakeJobs({
    db,
    env,
    request: new Request(`${requestOrigin}/api/jobs/process`, { method: 'POST' }),
    fetchImpl,
    jobId,
    nowMs,
  });
}

const bby = await queue('bby-wow', onePhoto);
const started = await run(bby.job.id);
assert(started.provider.name === 'agnes', JSON.stringify(started.provider));
assert(started.provider.model === AGNES_MODEL, started.provider.model);
assert(started.provider.mode === 'reference', started.provider.mode);
assert(started.provider.base_host === 'api.agnes-ai.cn', started.provider.base_host);
assert(started.processed[0].status === 'running', JSON.stringify(started.processed[0]));
assert(started.processed[0].provider === 'agnes', started.processed[0].provider);
const bbyBody = createBody(calls);
assert(bbyBody.seconds === '6', bbyBody.seconds);
assert(bbyBody.mode === 'reference', bbyBody.mode);
assert(bbyBody.images.length === 1, JSON.stringify(bbyBody.images.map((url) => new URL(url).pathname)));
const bbyAdapted = await adaptPack(parseTemplatePack(bbyWowPack), [{ roleId: 'lead', url: 'https://swaystill.com/pet.jpg' }]);
assert(bbyBody.prompt === bbyAdapted.segments[0].prompt, 'create did not call adaptPack');
assert(bbyAdapted.segments[0].promptSeconds === 6, 'bby prompt seconds');
assert(!/\bperson\b/i.test(bbyBody.prompt), bbyBody.prompt);
assert(new URL(bbyBody.images[0]).origin === 'https://swaystill.com', 'bby image origin');
assert(new URL(bbyBody.images[0]).pathname.endsWith('/photo'), 'bby image kind');
assert(new URL(bbyBody.images[0]).searchParams.has('sig'), 'bby image signed');
assert(!bbyBody.images[0].includes('photo-2'), 'bby photo-2');
assert(!bbyBody.videos, 'bby sent a reference video');
assert(!JSON.stringify(bbyBody).includes('pages.dev'), 'create body used the request host');
assert(!JSON.stringify(bbyBody).includes('workers.dev') && !JSON.stringify(bbyBody).includes('r2.dev'), 'blocked host in body');
const createsBeforePoll = script.creates;
script.poll = 'hide';
const hidden = await run(bby.job.id);
assert(hidden.processed[0].status === 'running', JSON.stringify(hidden.processed[0]));
assert(hidden.processed[0].action === 'polling', hidden.processed[0].action);
assert(!calls.some((call) => call.url.includes('cdn.example.com')), 'internal_status completed was treated as done');
const pollsAfterHide = calls.filter((call) => call.url.includes('/agnesapi')).length;
const rushed = await run(bby.job.id);
assert(calls.filter((call) => call.url.includes('/agnesapi')).length === pollsAfterHide, 'in-progress was polled again inside 6s');
assert(rushed.processed[0].status === 'running', JSON.stringify(rushed.processed[0]));
script.poll = 'completed';
const ready = await run(bby.job.id, Date.now() + 8000);
assert(ready.processed[0].status === 'ready', JSON.stringify(ready.processed[0]));
assert(calls.some((call) => call.url === 'https://cdn.example.com/out.mp4'), 'downloaded top-level url');
assert(script.creates === createsBeforePoll, 'poll created another Agnes task');
const readyRow = sqlite.prepare(`SELECT status, provider_task_id, note_en FROM jobs WHERE id = ?`).get(bby.job.id);
assert(readyRow.status === 'ready' && String(readyRow.provider_task_id).startsWith('agn_task_'), JSON.stringify(readyRow));
assert(!/agnes|bailian|waffo/i.test(readyRow.note_en), readyRow.note_en);
const afterBby = await getCredits(db, user);
assert(afterBby.balance === 494, `bby balance ${afterBby.balance}`);
assert(afterBby.ledger.filter((row) => row.job_id === bby.job.id).map((row) => row.kind).join() === 'deduction', 'bby charged once');

let kissBlocked = false;
try {
  await queue('kiss-cam', twoPhotos);
} catch (err) {
  kissBlocked = err && err.code === 'template_retired';
}
assert(kissBlocked, 'kiss cam is still creatable');
assert(!uiSource.includes('Coldplay Kiss Cam'), 'kiss cam title on a public page');

// Stream-copied prefixes of two real 720x1280 outputs whose stsd boxes differ in btrt.
const piece0 = fs.readFileSync(new URL('./fixtures/compatible-join/p0.mp4', import.meta.url));
const piece1 = fs.readFileSync(new URL('./fixtures/compatible-join/p1.mp4', import.meta.url));
assert(bitrateBoxes(piece0) !== bitrateBoxes(piece1), 'fixture stsd bitrate boxes match; it does not exercise the joiner');
const compatible = concatMp4([new Uint8Array(piece0), new Uint8Array(piece1)]);
const compatibleProbe = probeReferenceMp4(compatible);
assert(compatibleProbe.durationSeconds > 0.8 && compatibleProbe.durationSeconds < 2, `short join ${compatibleProbe.durationSeconds}`);
const tall = new Uint8Array(piece1);
const visual = visualSample(tall);
assert(visual > 0, 'fixture has no video sample entry');
tall[visual + 34] = 0x02;
tall[visual + 35] = 0x00;
let mismatched = false;
try {
  concatMp4([new Uint8Array(piece0), tall]);
} catch (err) {
  mismatched = err && err.code === 'segment_media';
}
assert(mismatched, 'different frame size was joined');

const packedSlots = packAgnesTaskSet(['task_piece_0001', '']);
const unpackedSlots = unpackAgnesTaskId(packedSlots);
assert(unpackedSlots.parallel && unpackedSlots.count === 2, JSON.stringify(unpackedSlots));
assert(unpackedSlots.slots[0] === 'task_piece_0001' && unpackedSlots.slots[1] === '', JSON.stringify(unpackedSlots.slots));
assert(unpackAgnesTaskId('ag1_task_piece_0001').parallel === false, 'legacy piece id was treated as parallel');

script.downloads = [piece0, piece1];
script.poll = 'completed';
const bailianBeforeFan = script.bailianTasks;
const createsBeforeFan = script.creates;
const fan = await queue('ceiling-fan', onePhoto);
const fanStart = await run(fan.job.id);
assert(fanStart.processed[0].provider === 'agnes', JSON.stringify(fanStart.processed[0]));
assert(fanStart.processed[0].status === 'running', JSON.stringify(fanStart.processed[0]));
const fanCreates = calls.filter((call) => call.url.startsWith('https://api.agnes-ai.cn/v1/videos')).slice(createsBeforeFan);
assert(fanCreates.length === 2, `parallel submit count ${fanCreates.length}`);
const fanBodies = fanCreates.map((call) => JSON.parse(call.init.body));
assert(fanBodies.every((body) => body.seconds === '8'), JSON.stringify(fanBodies.map((body) => body.seconds)));
assert(fanBodies.every((body) => body.images.length === 1 && body.prompt.includes('<Image 1>') && !/\bperson\b/i.test(body.prompt)), 'fan prompt');
assert(fanBodies.every((body) => !body.videos), 'fan sent a reference video');
assert(fanBodies.every((body) => !body.images[0].includes('photo-2')), 'fan photo-2');
assert(fanBodies.every((body) => body.images[0].startsWith('https://swaystill.com/')), 'fan image host');
assert(!fanBodies.some((body) => /pages\.dev|workers\.dev|r2\.dev/.test(JSON.stringify(body))), 'blocked host sent');
const fanPack = unpackAgnesTaskId(sqlite.prepare(`SELECT provider_task_id FROM jobs WHERE id = ?`).get(fan.job.id).provider_task_id);
assert(fanPack.parallel && fanPack.slots.every(Boolean), JSON.stringify(fanPack));
const pollsBeforeFan = calls.filter((call) => call.url.includes('/agnesapi')).length;
const cookie = (await issueSessionCookie(new Request(`${requestOrigin}/api/jobs/continue`, { method: 'POST' }), env, user)).split(';')[0];
const continued = await onContinue({
  env,
  request: new Request(`${requestOrigin}/api/jobs/continue`, { method: 'POST', headers: { cookie } }),
});
assert(continued.status === 200, `continue ${continued.status}`);
const continuedBody = await continued.json();
assert(continuedBody.processed.some((row) => row.id === fan.job.id && row.status === 'running'), JSON.stringify(continuedBody));
assert(calls.filter((call) => call.url.includes('/agnesapi')).length === pollsBeforeFan, 'continue polled the provider');
assert(script.creates === createsBeforeFan + 2, 'continue submitted another piece');
assert(!JSON.stringify(continuedBody).includes(AGNES_KEY), 'continue leaked the key');
const fanReady = await run(fan.job.id);
assert(fanReady.processed[0].status === 'ready', JSON.stringify(fanReady.processed[0]));
assert(script.bailianTasks === bailianBeforeFan, 'ceiling fan fell back to mix');
assert(script.creates === createsBeforeFan + 2, 'join created another task');
const fanRow = sqlite.prepare(`SELECT status, note_en, provider_task_id, error_code FROM jobs WHERE id = ?`).get(fan.job.id);
assert(fanRow.status === 'ready', fanRow.status);
assert(String(fanRow.provider_task_id).startsWith('m2_'), fanRow.provider_task_id);
assert(!fanRow.error_code, fanRow.error_code);
assert(!/agnes|bailian|waffo/i.test(fanRow.note_en), fanRow.note_en);
const afterFan = await getCredits(db, user);
assert(afterFan.balance === 494 - 15, `fan balance ${afterFan.balance}`);
assert(afterFan.ledger.filter((row) => row.job_id === fan.job.id).map((row) => row.kind).join() === 'deduction', 'fan charged once');

script.create = 'rate';
const rateSplit = await queue('ceiling-fan', onePhoto);
const rateSplitRun = await run(rateSplit.job.id);
assert(rateSplitRun.processed[0].status === 'queued', JSON.stringify(rateSplitRun.processed[0]));
assert(rateSplitRun.processed[0].error === 'retry_later', rateSplitRun.processed[0].error);
assert(script.bailianTasks === bailianBeforeFan, 'split 429 fell back to mix');
const rateSplitCreates = script.creates;
const rateSplitHeld = await run(rateSplit.job.id, Date.now() + 1000);
assert(rateSplitHeld.processed[0].status === 'queued', JSON.stringify(rateSplitHeld.processed[0]));
assert(script.creates === rateSplitCreates, 'split 429 retried inside the backoff');
script.create = 'ok';
const rateSplitGo = await run(rateSplit.job.id, Date.now() + 8000);
assert(rateSplitGo.processed[0].status === 'running', JSON.stringify(rateSplitGo.processed[0]));
assert(script.creates === rateSplitCreates + 2, 'split retry did not submit both pieces');
assert(String(sqlite.prepare(`SELECT provider_task_id FROM jobs WHERE id = ?`).get(rateSplit.job.id).provider_task_id).startsWith('m2_'), 'split retry was not packed');

script.create = 'rate-8';
script.downloads = [piece0, piece1];
const partial = await queue('ceiling-fan', onePhoto);
const partialStart = await run(partial.job.id);
assert(partialStart.processed[0].status === 'queued', JSON.stringify(partialStart.processed[0]));
assert(partialStart.processed[0].error === 'retry_later', partialStart.processed[0].error);
assert(script.bailianTasks === bailianBeforeFan, 'even split 429 fell back to mix');
const partialCreates = script.creates;
const partialHeld = await run(partial.job.id, Date.now() + 1000);
assert(script.creates === partialCreates, 'even split 429 retried inside the backoff');
assert(partialHeld.processed[0].status === 'queued', JSON.stringify(partialHeld.processed[0]));
script.create = 'ok';
const partialGo = await run(partial.job.id, Date.now() + 8000);
assert(partialGo.processed[0].status === 'running', JSON.stringify(partialGo.processed[0]));
assert(script.creates === partialCreates + 2, `even split retry creates ${script.creates - partialCreates}`);
const partialReady = await run(partial.job.id, Date.now() + 16000);
assert(partialReady.processed[0].status === 'ready', JSON.stringify(partialReady.processed[0]));
assert(
  (await getCredits(db, user)).ledger.filter((row) => row.job_id === partial.job.id).map((row) => row.kind).join() === 'deduction',
  'partial split charged twice',
);

script.create = 'reject-8';
script.poll = 'completed';
const refused = await queue('ceiling-fan', onePhoto);
const refusedRun = await run(refused.job.id);
assert(refusedRun.processed[0].status === 'failed', JSON.stringify(refusedRun.processed[0]));
assert(script.bailianTasks === bailianBeforeFan, 'a created piece fell back to mix');
const refusedCreates = script.creates;
const refusedAgain = await run(refused.job.id);
assert(script.creates === refusedCreates, 'failed split was generated again');
assert(refusedAgain.processed[0].status === 'failed', JSON.stringify(refusedAgain.processed[0]));
const refusedLedger = (await getCredits(db, user)).ledger.filter((row) => row.job_id === refused.job.id).map((row) => row.kind).sort().join();
assert(refusedLedger === 'deduction,refund', `refused split ledger ${refusedLedger}`);
const refusedNote = sqlite.prepare(`SELECT note_en, error_code FROM jobs WHERE id = ?`).get(refused.job.id);
assert(!/agnes|bailian|waffo/i.test(refusedNote.note_en), refusedNote.note_en);

script.create = 'ok';
script.poll = 'fail';
const splitFail = await queue('ceiling-fan', onePhoto);
const splitFailStart = await run(splitFail.job.id);
assert(splitFailStart.processed[0].status === 'running' && splitFailStart.processed[0].provider === 'agnes', JSON.stringify(splitFailStart.processed[0]));
const splitFailCreates = script.creates;
const splitFailed = await run(splitFail.job.id);
assert(splitFailed.processed[0].status === 'failed', JSON.stringify(splitFailed.processed[0]));
assert(script.creates === splitFailCreates, 'failed poll created another task');
assert(script.bailianTasks === bailianBeforeFan, 'failed poll fell back to mix');
const splitFailNote = sqlite.prepare(`SELECT error_code, note_en FROM jobs WHERE id = ?`).get(splitFail.job.id);
assert(splitFailNote.error_code === 'agnes_failed', splitFailNote.error_code);
assert(!/agnes|bailian|waffo/i.test(splitFailNote.note_en), splitFailNote.note_en);
const splitFailLedger = (await getCredits(db, user)).ledger.filter((row) => row.job_id === splitFail.job.id).map((row) => row.kind).sort().join();
assert(splitFailLedger === 'deduction,refund', `split fail ledger ${splitFailLedger}`);
await run(splitFail.job.id);
const splitFailLedgerAgain = (await getCredits(db, user)).ledger.filter((row) => row.job_id === splitFail.job.id && row.kind === 'refund');
assert(splitFailLedgerAgain.length === 1, 'split failure refunded twice');

script.poll = 'completed';
script.downloads = [new Uint8Array(piece0), tall];
const joinFail = await queue('ceiling-fan', onePhoto);
const joinStart = await run(joinFail.job.id);
assert(joinStart.processed[0].status === 'running', JSON.stringify(joinStart.processed[0]));
const joinCreates = script.creates;
const joinFailed = await run(joinFail.job.id);
assert(joinFailed.processed[0].status === 'failed', JSON.stringify(joinFailed.processed[0]));
assert(script.creates === joinCreates, 'join failure regenerated the pieces');
assert(script.bailianTasks === bailianBeforeFan, 'join failure fell back to mix');
const joinNote = sqlite.prepare(`SELECT error_code, note_en FROM jobs WHERE id = ?`).get(joinFail.job.id);
assert(joinNote.error_code === 'segment_join', joinNote.error_code);
assert(!/agnes|bailian|waffo/i.test(joinNote.note_en), joinNote.note_en);
const joinLedger = (await getCredits(db, user)).ledger.filter((row) => row.job_id === joinFail.job.id).map((row) => row.kind).sort().join();
assert(joinLedger === 'deduction,refund', `join ledger ${joinLedger}`);
await run(joinFail.job.id);
assert(
  (await getCredits(db, user)).ledger.filter((row) => row.job_id === joinFail.job.id && row.kind === 'refund').length === 1,
  'join failure refunded twice',
);

const studio = fs.readFileSync(new URL('../src/components/CreateStudio.astro', import.meta.url), 'utf8');
const accountScript = fs.readFileSync(new URL('../public/scripts/account-data.js', import.meta.url), 'utf8');
assert(!studio.includes('/api/jobs/continue'), 'create page still posts continue');
assert(studio.includes('30 * 60 * 1000'), 'create page watch is still about 10 minutes');
assert(studio.includes('No people.'), 'create copy');
assert(studio.includes('没有人'), 'create copy zh');
assert(studio.includes('photoSlots'), 'create uses slot meaning');
assert(!studio.includes('kiss-cam'), 'create still offers kiss cam');
assert(studio.includes('uploadCount === 1'), 'one-photo create still asks for one photo');
assert(!accountScript.includes('/api/jobs/continue'), 'account page still posts continue');
const drainConfig = fs.readFileSync(new URL('../workers/job-drain/wrangler.toml', import.meta.url), 'utf8');
assert(drainConfig.includes('crons = ["* * * * *"]'), drainConfig);

script.downloads = null;
script.poll = 'completed';
script.create = 'ok';

script.create = 'reject';
const bailianBeforeReject = script.bailianTasks;
const rejected = await queue('bby-wow', onePhoto);
const rejectRun = await run(rejected.job.id);
assert(rejectRun.processed[0].status === 'failed', JSON.stringify(rejectRun.processed[0]));
assert(script.bailianTasks === bailianBeforeReject, 'pet refusal fell back to mix');
const rejectRow = sqlite.prepare(`SELECT status, note_en FROM jobs WHERE id = ?`).get(rejected.job.id);
assert(rejectRow.status === 'failed', JSON.stringify(rejectRow));
assert(!/agnes|bailian|waffo/i.test(rejectRow.note_en), rejectRow.note_en);
const afterReject = await getCredits(db, user);
assert(afterReject.ledger.filter((row) => row.job_id === rejected.job.id).map((row) => row.kind).sort().join() === 'deduction,refund', 'refusal did not refund');

script.create = 'down';
const bailianBeforeOutage = script.bailianTasks;
const uncertain = await queue('bby-wow', onePhoto);
const createsBeforeOutage = script.creates;
const uncertainRun = await run(uncertain.job.id);
assert(uncertainRun.processed[0].status === 'failed', JSON.stringify(uncertainRun.processed[0]));
assert(script.bailianTasks === bailianBeforeOutage, 'pet outage fell back to mix');
assert(script.creates === createsBeforeOutage + 1, 'outage did not try Agnes');
const uncertainRow = sqlite.prepare(`SELECT status, note_en FROM jobs WHERE id = ?`).get(uncertain.job.id);
assert(uncertainRow.status === 'failed', uncertainRow.status);
assert(!/agnes|bailian|waffo/i.test(uncertainRow.note_en), uncertainRow.note_en);
assert(!uncertainRow.note_en.includes(AGNES_KEY), 'note leaked the key');
const afterUncertain = await getCredits(db, user);
assert(
  afterUncertain.ledger.filter((row) => row.job_id === uncertain.job.id).map((row) => row.kind).sort().join() === 'deduction,refund',
  'outage did not refund',
);

script.create = 'rate';
const rated = await queue('bby-wow', onePhoto);
const rateStart = Date.now();
const createsAtRate = script.creates;
const rateRun = await run(rated.job.id, rateStart);
assert(rateRun.processed[0].status === 'queued', JSON.stringify(rateRun.processed[0]));
assert(rateRun.processed[0].error === 'retry_later', rateRun.processed[0].error);
assert(script.creates === createsAtRate + 1, 'rate limit did not create');
const held = await run(rated.job.id, rateStart + 1000);
assert(held.processed[0].action === 'retry', JSON.stringify(held.processed[0]));
assert(script.creates === createsAtRate + 1, 'retried Agnes inside the backoff');
script.create = 'ok';
const released = await run(rated.job.id, rateStart + 8000);
assert(released.processed[0].status === 'running', JSON.stringify(released.processed[0]));
assert(script.creates === createsAtRate + 2, 'did not retry after the backoff');
assert(released.processed[0].provider === 'agnes', released.processed[0].provider);

script.poll = 'fail';
const failed = await queue('bby-wow', onePhoto);
const failedStart = await run(failed.job.id);
assert(failedStart.processed[0].status === 'running', JSON.stringify(failedStart.processed[0]));
const bailianBeforeFail = script.bailianTasks;
const createsBeforeFail = script.creates;
const failedPoll = await run(failed.job.id);
assert(failedPoll.processed[0].status === 'failed', JSON.stringify(failedPoll.processed[0]));
assert(script.bailianTasks === bailianBeforeFail, 'failed Agnes task fell through to mix');
assert(script.creates === createsBeforeFail, 'failed Agnes task was created again');
const failedNote = sqlite.prepare(`SELECT note_en, error_code FROM jobs WHERE id = ?`).get(failed.job.id);
assert(failedNote.error_code === 'agnes_failed', failedNote.error_code);
assert(!/agnes|bailian|waffo/i.test(failedNote.note_en), failedNote.note_en);
assert(!failedNote.note_en.includes(AGNES_KEY), failedNote.note_en);
const afterFailed = await getCredits(db, user);
assert(
  afterFailed.ledger.filter((row) => row.job_id === failed.job.id).map((row) => row.kind).sort().join() === 'deduction,refund',
  'failed task refund',
);

script.poll = 'rate';
script.agnesPolls = 0;
const polled = await queue('bby-wow', onePhoto);
const pollStart = await run(polled.job.id);
assert(pollStart.processed[0].provider === 'agnes', JSON.stringify(pollStart.processed[0]));
const pollsBefore = calls.filter((call) => call.url.includes('/agnesapi')).length;
const limited = await run(polled.job.id, Date.now());
assert(limited.processed[0].action === 'retry_poll', JSON.stringify(limited.processed[0]));
assert(limited.processed[0].error === 'retry_later', limited.processed[0].error);
const again = await run(polled.job.id, Date.now());
assert(calls.filter((call) => call.url.includes('/agnesapi')).length === pollsBefore + 1, '429 was polled again immediately');
script.poll = 'completed';
const later = await run(polled.job.id, Date.now() + 8000);
assert(later.processed[0].status === 'ready', JSON.stringify(later.processed[0]));

const switched = { ...env, VIDEO_PROVIDER: 'bailian' };
const forced = await queueJobWithMedia({
  db,
  env: switched,
  request: new Request(`${requestOrigin}/api/jobs`, { method: 'POST' }),
  user,
  templateSlug: 'bby-wow',
  photos: onePhoto,
  petsOnly: true,
});
const createsBeforeSwitch = script.creates;
const bailianBeforeSwitch = script.bailianTasks;
const switchRun = await processRemakeJobs({
  db,
  env: switched,
  request: new Request(`${requestOrigin}/api/jobs/process`, { method: 'POST' }),
  fetchImpl,
  jobId: forced.job.id,
});
assert(script.creates === createsBeforeSwitch, 'bailian switch called Agnes');
assert(script.bailianTasks === bailianBeforeSwitch, 'pet look sent a template video to mix');
assert(switchRun.processed[0].status === 'failed', JSON.stringify(switchRun.processed[0]));

const pagesEnv = { ...env, PUBLIC_SITE_APEX: 'viral-templates.pages.dev' };
const pagesJob = await queueJobWithMedia({
  db,
  env: pagesEnv,
  request: new Request(`${requestOrigin}/api/jobs`, { method: 'POST' }),
  user,
  templateSlug: 'bby-wow',
  photos: onePhoto,
  petsOnly: true,
});
const createsBeforePages = script.creates;
const bailianBeforePages = script.bailianTasks;
const pagesRun = await processRemakeJobs({
  db,
  env: pagesEnv,
  request: new Request(`${requestOrigin}/api/jobs/process`, { method: 'POST' }),
  fetchImpl,
  jobId: pagesJob.job.id,
});
assert(script.creates === createsBeforePages, 'pages.dev apex called Agnes');
assert(script.bailianTasks === bailianBeforePages, 'pages.dev apex used mix');
assert(pagesRun.processed[0].status === 'failed', JSON.stringify(pagesRun.processed[0]));
assert(!calls.some((call) => /pages\.dev|workers\.dev|r2\.dev/.test(JSON.stringify(call.init && call.init.body || ''))), 'provider body contains a blocked host');

console.log('agnes-video.test.mjs ok');
