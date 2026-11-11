import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { appendLedger, ensureMediaColumns, ensureSchema, getCredits, saveProviderTask } from '../functions/_lib/account-db.js';
import { probeImage } from '../functions/_lib/image-precheck.js';
import {
  CLASSIC_DASHSCOPE_BASE,
  DEFAULT_MODE,
  DEFAULT_MODEL,
  WORKSPACE_DASHSCOPE_BASE,
  assertDashScopeInputUrl,
  bailianRuntime,
  buildSynthesisRequest,
  resolveBailianApiKey,
  resolveDashScopeBase,
} from '../functions/_lib/bailian.js';
import { onRequestPost } from '../functions/api/jobs/process.js';
import { onRequestPost as onCreate } from '../functions/api/jobs/index.js';
import { onRequestPost as onContinue } from '../functions/api/jobs/continue.js';
import { queueJobWithMedia } from '../functions/_lib/job-media.js';
import { kickRemakeJob } from '../functions/_lib/remake-kick.js';
import { issueSessionCookie } from '../functions/_lib/session.js';
import { processRemakeJobs, SUBMIT_STALE_MS } from '../functions/_lib/bailian-worker.js';
import { DRAIN_LIMIT, DRAIN_POLL_INTERVAL_MS, DRAIN_WAIT_MS, drainRemakeJobs, processUrl } from '../workers/job-drain/index.js';
import { JOB_PROVIDER_COLUMNS } from '../functions/_lib/schema.js';
import { getTemplate } from '../functions/_lib/templates.js';

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
const API_KEY = 'sk-test-bailian-key';
const PROCESS_SECRET = 'job-process-secret-1';
const TASK_OK = '0385dc79-5ff8-4d82-bcb6-aaaaaa01';
const TASK_BAD = '0385dc79-5ff8-4d82-bcb6-bbbbbb02';
const WORKSPACE_HOST = 'llm-g1ozpdi7y5eyp1mh.cn-beijing.maas.aliyuncs.com';

assert(resolveDashScopeBase({}) === WORKSPACE_DASHSCOPE_BASE, 'default base');
assert(WORKSPACE_DASHSCOPE_BASE.includes(WORKSPACE_HOST), 'workspace host');
assert(resolveDashScopeBase({ BAILIAN_DASHSCOPE_BASE_URL: CLASSIC_DASHSCOPE_BASE }) === CLASSIC_DASHSCOPE_BASE, 'classic override');
assert(resolveBailianApiKey({ DASHSCOPE_API_KEY: 'legacy-key' }) === 'legacy-key', 'legacy key');
assert(resolveBailianApiKey({ BAILIAN_API_KEY: 'primary', DASHSCOPE_API_KEY: 'legacy-key' }) === 'primary', 'primary key wins');
assert(DEFAULT_MODEL === 'wan2.2-animate-mix', DEFAULT_MODEL);
assert(bailianRuntime({ BAILIAN_API_KEY: API_KEY }).model === DEFAULT_MODEL, 'model');
assert(bailianRuntime({ BAILIAN_API_KEY: API_KEY, BAILIAN_MODEL: 'wan2.2-animate-move' }).model === 'wan2.2-animate-move', 'model override');
assert(bailianRuntime({ BAILIAN_API_KEY: API_KEY }).mode === DEFAULT_MODE, 'mode');
assert(bailianRuntime({ BAILIAN_API_KEY: API_KEY }).configured === true, 'configured');
assert(bailianRuntime({}).configured === false, 'missing key');
let badMode = false;
try {
  bailianRuntime({ BAILIAN_API_KEY: API_KEY, BAILIAN_MODE: 'wan-ultra' });
} catch (err) {
  badMode = err && err.code === 'bailian_bad_mode';
}
assert(badMode, 'bad mode');
const pro = buildSynthesisRequest(
  { ...bailianRuntime({ BAILIAN_API_KEY: API_KEY, BAILIAN_MODE: 'wan-pro' }), apiKey: API_KEY },
  { imageUrl: 'oss://dashscope-instant/a/subject.jpg', videoUrl: 'oss://dashscope-instant/a/reference.mp4' },
);
assert(pro.body.model === 'wan2.2-animate-mix', pro.body.model);
assert(pro.body.parameters.mode === 'wan-pro', pro.body.parameters.mode);
assert(pro.body.input.watermark === false, 'watermark default');
assert(pro.headers['X-DashScope-Async'] === 'enable', 'async header');
assert(pro.headers['X-DashScope-OssResourceResolve'] === 'enable', 'oss header');
assert(pro.url.startsWith(`${WORKSPACE_DASHSCOPE_BASE}/services/aigc/image2video/video-synthesis`), pro.url);
assert(assertDashScopeInputUrl('oss://dashscope-instant/test/subject.jpg') === 'oss://dashscope-instant/test/subject.jpg', 'oss input');
for (const blockedUrl of [
  'https://viral-templates.pages.dev/api/media/jobs/job_x/photo?exp=1&sig=ab',
  'https://viral-templates.pages.dev/brand/templates/bby-wow-demo.mp4',
  'https://foo.workers.dev/clip.mp4',
  'https://pub-abc.r2.dev/clip.mp4',
  'http://media.example.com/a.jpg',
]) {
  let blocked = false;
  try {
    buildSynthesisRequest(bailianRuntime({ BAILIAN_API_KEY: API_KEY }), {
      imageUrl: blockedUrl,
      videoUrl: 'oss://dashscope-instant/test/reference.mp4',
    });
  } catch (err) {
    blocked = err && err.code === 'bailian_unreachable_input';
  }
  assert(blocked, `accepted unreachable input ${blockedUrl}`);
}
let pagesBase = false;
try {
  bailianRuntime({ BAILIAN_API_KEY: API_KEY, BAILIAN_PUBLIC_MEDIA_BASE: 'https://viral-templates.pages.dev' });
} catch (err) {
  pagesBase = err && err.code === 'bailian_bad_base';
}
assert(pagesBase, 'pages.dev public base refused');
const mainland = bailianRuntime({
  BAILIAN_API_KEY: API_KEY,
  BAILIAN_PUBLIC_MEDIA_BASE: 'https://media.example.com/bucket',
});
const viaMainland = buildSynthesisRequest(mainland, {
  imageUrl: 'https://media.example.com/uploads/subject.jpg',
  videoUrl: 'https://media.example.com/templates/demo.mp4',
});
assert(viaMainland.body.input.image_url.startsWith('https://media.example.com/'), viaMainland.body.input.image_url);
assert(!viaMainland.body.input.video_url.includes('pages.dev'), 'mainland url picked up pages.dev');

for (const slug of ['bby-wow', 'kiss-cam', 'ceiling-fan']) {
  const template = getTemplate(slug);
  assert(template.referenceVideo && template.referenceVideo.endsWith('.mp4'), slug);
  assert(fs.existsSync(new URL(`../public${template.referenceVideo}`, import.meta.url)), template.referenceVideo);
}
assert(getTemplate('bulin-47').referenceVideo == null, 'soon template has no reference');
assert(getTemplate('kiss-cam').photoCount === 2, 'kiss cam still two photos');

const workerSource = fs.readFileSync(new URL('../functions/_lib/bailian-worker.js', import.meta.url), 'utf8');
const dbSource = fs.readFileSync(new URL('../functions/_lib/account-db.js', import.meta.url), 'utf8');
assert(workerSource.includes('upload_key'), 'worker reads the subject photo');
assert(!workerSource.includes('upload_key_2'), 'second photo is not sent');
assert(!workerSource.includes('row.upload_url'), 'signed pages.dev url is not a Bailian input');
assert(dbSource.includes('refundChargeById'), 'failed jobs refund');
assert(dbSource.includes("kind: 'refund'"), 'refund kind named');

const baseline = fs.readFileSync(new URL('../migrations/0001_account.sql', import.meta.url), 'utf8');
const mediaMigration = fs.readFileSync(new URL('../migrations/0002_r2_media.sql', import.meta.url), 'utf8');
const upgradeSqlite = new DatabaseSync(':memory:');
upgradeSqlite.exec(baseline);
upgradeSqlite.exec(mediaMigration);
const upgradeDb = wrap(upgradeSqlite);
await ensureMediaColumns(upgradeDb);
const upgraded = new Set(upgradeSqlite.prepare(`PRAGMA table_info(jobs)`).all().map((row) => row.name));
for (const name of JOB_PROVIDER_COLUMNS) assert(upgraded.has(name), `upgrade missing ${name}`);

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

function resultTask(taskId) {
  return {
    output: {
      task_id: taskId,
      task_status: 'SUCCEEDED',
      results: { video_url: 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/out.mp4?Expires=1' },
    },
    request_id: 'req_ok',
  };
}

function installFetch(options = {}) {
  const calls = [];
  let submitted = 0;
  async function fetchImpl(url, init = {}) {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.includes('/brand/templates/') && href.endsWith('.mp4')) {
      return new Response(mp4, { status: 200, headers: { 'content-type': 'video/mp4' } });
    }
    if (href.includes('/uploads')) {
      if (href.includes(WORKSPACE_HOST)) return jsonResponse(404, { code: 'NotFound', message: 'no uploads on workspace' });
      assert(href.startsWith(CLASSIC_DASHSCOPE_BASE), href);
      return jsonResponse(200, policy);
    }
    if (href.includes('dashscope-file-mgr.oss-cn-beijing.aliyuncs.com')) {
      assert(init.body && typeof init.body.get === 'function', 'oss form');
      const key = init.body.get('key');
      assert(String(key).startsWith('dashscope-instant/test/2026/'), String(key));
      return new Response(null, { status: 200 });
    }
    if (href.includes('/services/aigc/image2video/video-synthesis')) {
      assert(href.startsWith(WORKSPACE_DASHSCOPE_BASE), href);
      const headers = init.headers || {};
      assert(headers.Authorization === `Bearer ${API_KEY}`, 'synthesis auth');
      assert(headers['X-DashScope-Async'] === 'enable', 'synthesis async');
      assert(headers['X-DashScope-OssResourceResolve'] === 'enable', 'synthesis oss');
      const body = JSON.parse(init.body);
      assert(body.model === DEFAULT_MODEL, body.model);
      assert(body.parameters.mode === DEFAULT_MODE, body.parameters.mode);
      assert(body.input.image_url === 'oss://dashscope-instant/test/2026/subject.jpg', body.input.image_url);
      assert(body.input.video_url === 'oss://dashscope-instant/test/2026/reference.mp4', body.input.video_url);
      assert(body.input.watermark === false, 'watermark sent');
      submitted += 1;
      const taskId = options.unique
        ? `0385dc79-5ff8-4d82-bcb6-u${String(submitted).padStart(6, '0')}`
        : TASK_OK;
      return jsonResponse(200, { output: { task_id: taskId, task_status: 'PENDING' }, request_id: 'req_submit' });
    }
    if (href.includes('/tasks/')) {
      if (href.includes(TASK_BAD)) {
        return jsonResponse(200, {
          output: {
            task_id: TASK_BAD,
            task_status: 'FAILED',
            code: 'InternalError',
            message: `bad key ${API_KEY} leaked`,
          },
        });
      }
      return jsonResponse(200, resultTask(TASK_OK));
    }
    if (href.includes('dashscope-result-bj.oss-cn-beijing.aliyuncs.com')) {
      return new Response(mp4, { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(mp4.byteLength) } });
    }
    throw new Error(`unexpected fetch ${href}`);
  }
  return { fetchImpl, calls };
}

const sqlite = new DatabaseSync(':memory:');
const db = wrap(sqlite);
await ensureSchema(db);
const freshCols = new Set(sqlite.prepare(`PRAGMA table_info(jobs)`).all().map((row) => row.name));
assert(freshCols.has('provider_task_id'), 'fresh schema task id');

const bucket = mockBucket();
const user = { user_id: 'u_alice', email: 'alice@example.com', name: 'Alice' };
const origin = 'https://viral-templates.pages.dev';
const env = {
  DB: db,
  MEDIA: bucket,
  ASSETS: {
    async fetch(request) {
      const href = String(request && request.url ? request.url : request);
      if (href.includes('/brand/templates/') && href.endsWith('.mp4')) {
        return new Response(mp4, { status: 200, headers: { 'content-type': 'video/mp4' } });
      }
      return new Response('missing', { status: 404 });
    },
  },
  AUTH_SECRET: 'media-test-secret-1',
  VIDEO_PROVIDER: 'bailian',
  BAILIAN_API_KEY: API_KEY,
  DASHSCOPE_API_KEY: 'should-not-win',
  JOB_PROCESS_SECRET: PROCESS_SECRET,
};
await appendLedger(db, user, {
  delta: 500,
  kind: 'topup',
  label_en: 'Test pack',
  label_zh: '测试包',
});
const queued = await queueJobWithMedia({
  db,
  env,
  request: new Request(`${origin}/api/jobs`, { method: 'POST' }),
  user,
  templateSlug: 'bby-wow',
  photos: [{ bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' }],
});
assert(queued.job.status === 'queued', 'queued');

const bare = await queueJobWithMedia({
  db,
  env,
  request: new Request(`${origin}/api/jobs`, { method: 'POST' }),
  user,
  templateSlug: 'bulin-47',
  photos: [],
});

const { fetchImpl, calls } = installFetch();
const previous = globalThis.fetch;
globalThis.fetch = fetchImpl;

const unconfigured = await onRequestPost({
  env: { ...env, JOB_PROCESS_SECRET: '' },
  request: new Request(`${origin}/api/jobs/process`, { method: 'POST' }),
});
assert(unconfigured.status === 503, `unconfigured ${unconfigured.status}`);
const unconfiguredBody = await unconfigured.json();
assert(unconfiguredBody.error === 'job_process_unconfigured', unconfiguredBody.error);

const denied = await onRequestPost({
  env,
  request: new Request(`${origin}/api/jobs/process`, {
    method: 'POST',
    headers: { authorization: 'Bearer nope-nope-nope-nope' },
  }),
});
assert(denied.status === 401, `denied ${denied.status}`);

const missingKey = await onRequestPost({
  env: { ...env, BAILIAN_API_KEY: '   ', DASHSCOPE_API_KEY: '' },
  request: new Request(`${origin}/api/jobs/process`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROCESS_SECRET}`, 'content-type': 'application/json' },
    body: '{}',
  }),
});
assert(missingKey.status === 503, `missing key ${missingKey.status}`);
assert((await missingKey.json()).error === 'bailian_unconfigured', 'missing key code');
assert(!calls.some((call) => call.url.includes('dashscope') || call.url.includes('aliyuncs')), 'unconfigured called provider');

const response = await onRequestPost({
  env,
  request: new Request(`${origin}/api/jobs/process`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${PROCESS_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ job_id: queued.job.id, limit: 1 }),
  }),
});
const submitted = await response.json();
assert(response.status === 200, JSON.stringify(submitted));
assert(submitted.provider.base_host === WORKSPACE_HOST, submitted.provider.base_host);
assert(submitted.processed[0].status === 'running', JSON.stringify(submitted.processed[0]));
assert(submitted.processed[0].action === 'submitted', submitted.processed[0].action);
assert(submitted.processed[0].task_id === TASK_OK, submitted.processed[0].task_id);

const polled = await onRequestPost({
  env,
  request: new Request(`${origin}/api/jobs/process`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${PROCESS_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ job_id: queued.job.id }),
  }),
});
const body = await polled.json();
assert(polled.status === 200, JSON.stringify(body));
assert(body.provider.model === DEFAULT_MODEL, body.provider.model);
assert(body.provider.mode === DEFAULT_MODE, body.provider.mode);
assert(body.processed.length === 1, JSON.stringify(body.processed));
assert(body.processed[0].status === 'ready', JSON.stringify(body.processed[0]));
assert(body.processed[0].action === 'stored', body.processed[0].action);
assert(String(body.processed[0].result_url).includes(`/api/media/jobs/${queued.job.id}/result`), body.processed[0].result_url);
assert(!JSON.stringify(body).includes(API_KEY), 'api key leaked in response');

const saved = sqlite.prepare(`SELECT status, result_key, result_url, provider_task_id, error_code FROM jobs WHERE id = ?`).get(queued.job.id);
assert(saved.status === 'ready', saved.status);
assert(saved.provider_task_id === TASK_OK, saved.provider_task_id);
assert(saved.result_key === `results/u_alice/${queued.job.id}.mp4`, saved.result_key);
assert(bucket.objects.has(saved.result_key), 'result object missing');
assert(
  new TextDecoder().decode(bucket.objects.get(saved.result_key).bytes).includes('trainedAlgorithmicMedia'),
  'stored clip missing AI label',
);
assert(calls.some((call) => call.url.startsWith(`${CLASSIC_DASHSCOPE_BASE}/uploads`)), 'classic upload fallback');
assert(calls.some((call) => call.url.startsWith(`${WORKSPACE_DASHSCOPE_BASE}/services/aigc/image2video/video-synthesis`)), 'workspace synthesis');
assert(!calls.some((call) => call.url.startsWith(`${CLASSIC_DASHSCOPE_BASE}/services/`)), 'synthesis stayed off classic');
assert(!calls.some((call) => call.url.includes('pages.dev') || call.url.includes('/brand/templates/')), 'worker did not ask Bailian to fetch pages.dev');
const synthesis = calls.find((call) => call.url.includes('/video-synthesis'));
const synthesisBody = JSON.parse(synthesis.init.body);
assert(synthesisBody.input.image_url.startsWith('oss://'), synthesisBody.input.image_url);
assert(synthesisBody.input.video_url.startsWith('oss://'), synthesisBody.input.video_url);
assert(!JSON.stringify(synthesisBody).includes('pages.dev'), 'synthesis body contains pages.dev');

const bbyCost = getTemplate('bby-wow').creditCost;
assert(bbyCost === 6, `bby credits ${bbyCost}`);
const credits = await getCredits(db, user);
assert(credits.balance === 500 - bbyCost, `success kept the charge (${credits.balance})`);
assert(credits.ledger.some((row) => row.kind === 'deduction' && row.job_id === queued.job.id && row.delta === -bbyCost), 'bby deduction');

sqlite.prepare(
  `UPDATE jobs SET status = 'running', provider_task_id = ?, error_code = NULL, result_url = NULL, result_key = NULL WHERE id = ?`,
).run(TASK_BAD, bare.job.id);
const failedRes = await onRequestPost({
  env,
  request: new Request(`${origin}/api/jobs/process`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROCESS_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ job_id: bare.job.id }),
  }),
});
const failedBody = await failedRes.json();
assert(failedRes.status === 200, JSON.stringify(failedBody));
assert(failedBody.processed[0].status === 'failed', JSON.stringify(failedBody.processed[0]));
assert(failedBody.processed[0].error === 'bailian_InternalError', failedBody.processed[0].error);
assert(!JSON.stringify(failedBody).includes(API_KEY), 'api key leaked on failure');
assert(String(failedBody.processed[0].detail || '').includes('[redacted]'), failedBody.processed[0].detail);
const failedRow = sqlite.prepare(`SELECT status, result_url, error_code, note_en FROM jobs WHERE id = ?`).get(bare.job.id);
assert(failedRow.status === 'failed' && failedRow.result_url == null, 'failed row');
assert(failedRow.error_code === 'bailian_InternalError', failedRow.error_code);
assert(!String(failedRow.note_en).includes(API_KEY), 'note leaked key');
const afterFail = await getCredits(db, user);
assert(afterFail.balance === 500 - bbyCost, `unbilled failure moved credits (${afterFail.balance})`);
assert(!afterFail.ledger.some((row) => row.job_id === bare.job.id), 'unbilled job wrote a ledger row');

const noPhoto = await queueJobWithMedia({
  db,
  env,
  request: new Request(`${origin}/api/jobs`, { method: 'POST' }),
  user,
  templateSlug: 'bby-wow',
  photos: [],
});
const noPhotoRes = await onRequestPost({
  env,
  request: new Request(`${origin}/api/jobs/process`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROCESS_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ job_id: noPhoto.job.id }),
  }),
});
const noPhotoBody = await noPhotoRes.json();
assert(noPhotoBody.processed[0].error === 'no_photo', JSON.stringify(noPhotoBody));

const huge = probeImage('jpeg', 720, 1280, 5 * 1024 * 1024 + 16);
const hugeJob = await queueJobWithMedia({
  db,
  env,
  request: new Request(`${origin}/api/jobs`, { method: 'POST' }),
  user,
  templateSlug: 'ceiling-fan',
  photos: [{ bytes: huge, contentType: 'image/jpeg', ext: 'jpg' }],
});
const hugeRes = await onRequestPost({
  env,
  request: new Request(`${origin}/api/jobs/process`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROCESS_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ job_id: hugeJob.job.id }),
  }),
});
const hugeBody = await hugeRes.json();
assert(hugeBody.processed[0].error === 'photo_too_large', JSON.stringify(hugeBody.processed[0]));
const afterHuge = await getCredits(db, user);
assert(afterHuge.balance === 500 - bbyCost, `huge refund balance ${afterHuge.balance}`);
assert(afterHuge.ledger.some((row) => row.kind === 'refund' && row.job_id === hugeJob.job.id && row.delta === 15), 'fan refund');

const kissMissing = await queueJobWithMedia({
  db,
  env,
  request: new Request(`${origin}/api/jobs`, { method: 'POST' }),
  user,
  templateSlug: 'kiss-cam',
  photos: [],
});
const kissFail = await kickRemakeJob({
  db,
  env,
  request: new Request(`${origin}/api/jobs`, { method: 'POST' }),
  jobId: kissMissing.job.id,
});
assert(kissFail.processed[0].error === 'no_photo', JSON.stringify(kissFail));
assert(kissFail.processed[0].status === 'failed', kissFail.processed[0].status);
const kissNote = sqlite.prepare(`SELECT status, error_code, note_en, note_zh FROM jobs WHERE id = ?`).get(kissMissing.job.id);
assert(kissNote.status === 'failed' && kissNote.error_code === 'no_photo', JSON.stringify(kissNote));
assert(kissNote.note_en.includes('two saved photos'), kissNote.note_en);
assert(kissNote.note_zh.includes('两张'), kissNote.note_zh);

const { fetchImpl: providerFetch, calls: kickCalls } = installFetch({ unique: true });
let releaseFetch;
const fetchGate = new Promise((resolve) => {
  releaseFetch = resolve;
});
globalThis.fetch = async (url, init) => {
  await fetchGate;
  return providerFetch(url, init);
};
const cookieLine = await issueSessionCookie(new Request(`${origin}/api/jobs`, { method: 'POST' }), env, user);
const cookie = cookieLine.split(';')[0];
const form = new FormData();
form.set('template_slug', 'kiss-cam');
form.set('photo_0', new File([jpeg], 'a.jpg', { type: 'image/jpeg' }));
form.set('photo_1', new File([jpeg], 'b.jpg', { type: 'image/jpeg' }));
const pending = [];
const created = await Promise.race([
  onCreate({
    env: { ...env, JOB_PROCESS_SECRET: '' },
    request: new Request(`${origin}/api/jobs`, { method: 'POST', headers: { cookie }, body: form }),
    waitUntil(promise) {
      pending.push(promise);
    },
  }),
  new Promise((_, reject) => setTimeout(() => reject(new Error('create blocked on provider')), 500)),
]);
assert(created.status === 201, `create ${created.status}`);
const createdBody = await created.json();
assert(createdBody.ok === true && createdBody.job.status === 'queued', JSON.stringify(createdBody.job));
assert(createdBody.media.photos === 2, `kiss-cam photos ${createdBody.media.photos}`);
assert(pending.length === 1, 'create registered waitUntil');
const stillQueued = sqlite.prepare(`SELECT status FROM jobs WHERE id = ?`).get(createdBody.job.id);
assert(stillQueued.status === 'queued' || stillQueued.status === 'running', stillQueued.status);
releaseFetch();
await pending[0];
const taskPolls = kickCalls.filter((call) => call.url.includes('/tasks/'));
assert(taskPolls.length === 1, `create kick should poll once, saw ${taskPolls.length}`);
assert(kickCalls.some((call) => call.url.includes('/video-synthesis')), 'create kick submitted');
assert(!kickCalls.some((call) => String(call.init && call.init.headers && call.init.headers.authorization || '').includes('job-process')), 'kick did not send the process secret');
const kicked = sqlite.prepare(`SELECT status, error_code FROM jobs WHERE id = ?`).get(createdBody.job.id);
assert(kicked.status === 'ready', `kick finished as ${kicked.status}`);
assert(!kicked.error_code, kicked.error_code);

globalThis.fetch = providerFetch;
const bob = { user_id: 'u_bob', email: 'bob@example.com', name: 'Bob' };
await appendLedger(db, bob, {
  delta: 100,
  kind: 'topup',
  label_en: 'Test pack',
  label_zh: '测试包',
});
const bobJob = await queueJobWithMedia({
  db,
  env,
  request: new Request(`${origin}/api/jobs`, { method: 'POST' }),
  user: bob,
  templateSlug: 'bby-wow',
  photos: [{ bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' }],
});
const aliceNext = await queueJobWithMedia({
  db,
  env,
  request: new Request(`${origin}/api/jobs`, { method: 'POST' }),
  user,
  templateSlug: 'ceiling-fan',
  photos: [{ bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' }],
});
const anon = await onContinue({
  env,
  request: new Request(`${origin}/api/jobs/continue`, { method: 'POST' }),
});
assert(anon.status === 401, `continue anon ${anon.status}`);
const callsBeforeContinue = kickCalls.length;
const continued = await onContinue({
  env: { ...env, JOB_PROCESS_SECRET: '' },
  request: new Request(`${origin}/api/jobs/continue`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ job_id: bobJob.job.id, authorization: `Bearer ${PROCESS_SECRET}` }),
  }),
});
assert(continued.status === 200, `continue ${continued.status}`);
const continuedBody = await continued.json();
assert(kickCalls.length === callsBeforeContinue, 'continue called the provider');
assert(continuedBody.processed.some((row) => row.id === aliceNext.job.id && row.status === 'queued'), JSON.stringify(continuedBody));
assert(!JSON.stringify(continuedBody).includes(API_KEY), 'continue leaked the api key');
const aliceStill = sqlite.prepare(`SELECT status FROM jobs WHERE id = ?`).get(aliceNext.job.id);
assert(aliceStill.status === 'queued', `continue started the job (${aliceStill.status})`);
const bobRow = sqlite.prepare(`SELECT status FROM jobs WHERE id = ?`).get(bobJob.job.id);
assert(bobRow.status === 'queued', `other user was processed (${bobRow.status})`);

assert(processUrl({}) === 'https://viral-templates.pages.dev/api/jobs/process', processUrl({}));
assert(
  processUrl({ PAGES_ORIGIN: 'https://viral-templates.pages.dev/ignored' }) ===
    'https://viral-templates.pages.dev/api/jobs/process',
  'drain origin drops a path',
);
let drained = null;
const drain = await drainRemakeJobs(
  { JOB_PROCESS_SECRET: PROCESS_SECRET, BAILIAN_API_KEY: API_KEY, PAGES_ORIGIN: 'https://viral-templates.pages.dev' },
  async (url, init) => {
    drained = { url, init };
    return new Response('{}', { status: 200 });
  },
);
assert(drain.ok === true && drain.status === 200, JSON.stringify(drain));
assert(drained.url.endsWith('/api/jobs/process'), drained.url);
assert(drained.init.headers.authorization === `Bearer ${PROCESS_SECRET}`, 'drain bearer');
const drainBody = JSON.parse(drained.init.body);
assert(drainBody.limit === DRAIN_LIMIT, drained.init.body);
assert(drainBody.wait_ms === DRAIN_WAIT_MS && drainBody.poll_interval_ms === DRAIN_POLL_INTERVAL_MS, drained.init.body);
assert(!JSON.stringify(drained.init).includes(API_KEY), 'drain sent the bailian key');
const drainSkipped = await drainRemakeJobs({ JOB_PROCESS_SECRET: 'short', BAILIAN_API_KEY: API_KEY }, async () => {
  throw new Error('unconfigured drain must not fetch');
});
assert(drainSkipped.error === 'job_process_unconfigured', drainSkipped.error);

assert(SUBMIT_STALE_MS === 8 * 60 * 1000, `stale window ${SUBMIT_STALE_MS}`);
assert(!workerSource.includes("failJob(db, row, 'submit_interrupted')"), 'stale submit still fails the job');
const taskIndexes = sqlite.prepare(`PRAGMA index_list(jobs)`).all();
const taskIndex = taskIndexes.find((row) => row.name === 'idx_jobs_provider_task_id');
assert(taskIndex && Number(taskIndex.unique) === 1, JSON.stringify(taskIndexes));
const nullTaskIds = sqlite.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE provider_task_id IS NULL`).get();
assert(nullTaskIds.n >= 2, `unique index rejected null task ids (${nullTaskIds.n})`);

const staleNow = Date.parse('2026-11-11T06:00:00.000Z');
const staleJob = await queueJobWithMedia({
  db,
  env,
  request: new Request(`${origin}/api/jobs`, { method: 'POST' }),
  user,
  templateSlug: 'bby-wow',
  photos: [{ bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' }],
});
function ledgerKinds(jobId) {
  return getCredits(db, user).then((credits) =>
    credits.ledger.filter((row) => row.job_id === jobId).map((row) => row.kind).sort().join(),
  );
}
assert((await ledgerKinds(staleJob.job.id)) === 'deduction', 'stale job was not charged');
sqlite.prepare(
  `UPDATE jobs SET status = 'running', provider_task_id = NULL, error_code = 'submitting', updated_at = ? WHERE id = ?`,
).run(new Date(staleNow - SUBMIT_STALE_MS + 1000).toISOString(), staleJob.job.id);
const stillRunning = await processRemakeJobs({
  db,
  env,
  request: new Request(`${origin}/api/jobs/process`, { method: 'POST' }),
  fetchImpl,
  jobId: staleJob.job.id,
  nowMs: staleNow,
});
assert(stillRunning.processed[0].status === 'running', JSON.stringify(stillRunning.processed[0]));
assert(stillRunning.processed[0].action === 'busy', stillRunning.processed[0].action);
sqlite.prepare(`UPDATE jobs SET updated_at = ? WHERE id = ?`).run(
  new Date(staleNow - SUBMIT_STALE_MS).toISOString(),
  staleJob.job.id,
);
const requeued = await processRemakeJobs({
  db,
  env,
  request: new Request(`${origin}/api/jobs/process`, { method: 'POST' }),
  fetchImpl,
  jobId: staleJob.job.id,
  nowMs: staleNow,
});
assert(requeued.processed[0].status === 'queued', JSON.stringify(requeued.processed[0]));
assert(requeued.processed[0].action === 'retry', requeued.processed[0].action);
assert(requeued.processed[0].error === 'submit_stale', requeued.processed[0].error);
const requeuedRow = sqlite.prepare(`SELECT status, provider_task_id, error_code FROM jobs WHERE id = ?`).get(staleJob.job.id);
assert(
  requeuedRow.status === 'queued' && requeuedRow.provider_task_id == null && requeuedRow.error_code == null,
  JSON.stringify(requeuedRow),
);
assert((await ledgerKinds(staleJob.job.id)) === 'deduction', 'stale requeue refunded the charge');

const lateTaskId = '0385dc79-5ff8-4d82-bcb6-cccccc03';
await saveProviderTask(db, staleJob.job.id, lateTaskId);
const lateRow = sqlite.prepare(`SELECT status, provider_task_id FROM jobs WHERE id = ?`).get(staleJob.job.id);
assert(lateRow.status === 'running' && lateRow.provider_task_id === lateTaskId, JSON.stringify(lateRow));

const takenJob = await queueJobWithMedia({
  db,
  env,
  request: new Request(`${origin}/api/jobs`, { method: 'POST' }),
  user,
  templateSlug: 'bby-wow',
  photos: [{ bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' }],
});
let takenDirect = '';
try {
  await saveProviderTask(db, takenJob.job.id, lateTaskId);
} catch (err) {
  takenDirect = err && err.code;
}
assert(takenDirect === 'provider_task_taken', takenDirect);
const takenDirectRow = sqlite.prepare(`SELECT status, provider_task_id FROM jobs WHERE id = ?`).get(takenJob.job.id);
assert(takenDirectRow.status === 'queued' && takenDirectRow.provider_task_id == null, JSON.stringify(takenDirectRow));
const lateOwners = sqlite.prepare(`SELECT id FROM jobs WHERE provider_task_id = ?`).all(lateTaskId);
assert(lateOwners.length === 1 && lateOwners[0].id === staleJob.job.id, JSON.stringify(lateOwners));

let rawDup = false;
try {
  sqlite.prepare(`UPDATE jobs SET provider_task_id = ? WHERE id = ?`).run(TASK_OK, takenJob.job.id);
} catch (err) {
  rawDup = /unique constraint failed/i.test(String(err && err.message));
}
assert(rawDup, 'unique index allowed a second writer to store the same task id');
assert(sqlite.prepare(`SELECT provider_task_id FROM jobs WHERE id = ?`).get(takenJob.job.id).provider_task_id == null, 'raw duplicate was stored');

const shared = await processRemakeJobs({
  db,
  env,
  request: new Request(`${origin}/api/jobs/process`, { method: 'POST' }),
  fetchImpl,
  jobId: takenJob.job.id,
  nowMs: Date.now(),
});
assert(shared.processed[0].status === 'failed', JSON.stringify(shared.processed[0]));
assert(shared.processed[0].error === 'provider_task_taken', shared.processed[0].error);
const sharedRow = sqlite.prepare(`SELECT status, provider_task_id, error_code, note_en FROM jobs WHERE id = ?`).get(takenJob.job.id);
assert(sharedRow.status === 'failed' && sharedRow.provider_task_id == null, JSON.stringify(sharedRow));
assert(sharedRow.error_code === 'provider_task_taken', sharedRow.error_code);
assert(!String(sharedRow.note_en).includes(API_KEY), 'taken note leaked the key');
const taskOwners = sqlite.prepare(`SELECT id, status FROM jobs WHERE provider_task_id = ?`).all(TASK_OK);
assert(taskOwners.length === 1 && taskOwners[0].id === queued.job.id && taskOwners[0].status === 'ready', JSON.stringify(taskOwners));
assert((await ledgerKinds(takenJob.job.id)) === 'deduction,refund', 'taken job was not refunded once');

let failedAttach = '';
try {
  await saveProviderTask(db, takenJob.job.id, '0385dc79-5ff8-4d82-bcb6-dddddd04');
} catch (err) {
  failedAttach = err && err.code;
}
assert(failedAttach === 'storage_error', failedAttach);
assert(sqlite.prepare(`SELECT status, provider_task_id FROM jobs WHERE id = ?`).get(takenJob.job.id).provider_task_id == null, 'failed job accepted a task id');

globalThis.fetch = previous;
console.log('bailian-worker.test.mjs ok');
