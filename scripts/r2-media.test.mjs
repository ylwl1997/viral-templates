import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { appendLedger, attachJobResult, ensureMediaColumns, ensureSchema, getCredits, listJobs } from '../functions/_lib/account-db.js';
import { probeImage } from '../functions/_lib/image-precheck.js';
import {
  authorizeMediaRequest,
  ingestAuthorized,
  loadStoredObject,
  queueJobWithMedia,
  readCreateJobBody,
  resultUrlSigner,
  storeJobResult,
} from '../functions/_lib/job-media.js';
import { JOB_MEDIA_COLUMNS } from '../functions/_lib/schema.js';
import { issueSessionCookie } from '../functions/_lib/session.js';
import { getTemplate } from '../functions/_lib/templates.js';
import {
  BUCKET_NAME,
  BINDING_NAME,
  assertObjectKey,
  imageFromDataUrl,
  mediaDownloadUrl,
  photoObjectKey,
  putMedia,
  resultObjectKey,
  retentionDays,
  signMediaQuery,
  sniffImage,
  sniffMp4,
  verifyMediaQuery,
  videoFromDataUrl,
} from '../functions/_lib/r2-media.js';

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

async function expectCode(fn, code) {
  try {
    await fn();
  } catch (err) {
    assert(err && err.code === code, `expected ${code}, got ${err && err.code}: ${err}`);
    return;
  }
  throw new Error(`expected ${code}`);
}

function pad(bytes) {
  const out = new Uint8Array(32);
  out.set(bytes);
  return out;
}

const jpeg = probeImage('jpeg', 720, 1280);
const png = probeImage('png', 800, 1000);
const webp = probeImage('webp', 640, 960);
const mp4 = pad(Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]));
const html = pad(Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]));

assert(sniffImage(jpeg).ext === 'jpg', 'jpeg');
assert(sniffImage(png).ext === 'png', 'png');
assert(sniffImage(webp).ext === 'webp', 'webp');
assert(sniffImage(html) == null, 'html sniffed as image');
assert(sniffMp4(mp4).contentType === 'video/mp4', 'mp4');
assert(sniffMp4(jpeg) == null, 'jpeg sniffed as mp4');

const fromUrl = imageFromDataUrl(`data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`);
assert(fromUrl.ext === 'jpg' && fromUrl.bytes[0] === 0xff, 'data url');
await expectCode(() => imageFromDataUrl('data:image/svg+xml;base64,PHN2Zz4='), 'bad_photo');
const fromVideo = videoFromDataUrl(`data:video/mp4;base64,${Buffer.from(mp4).toString('base64')}`);
assert(fromVideo.ext === 'mp4', 'video data url');

assert(retentionDays({}).photo === 7 && retentionDays({}).video === 30, 'retention defaults');
assert(retentionDays({ PHOTO_RETENTION_DAYS: '9', VIDEO_RETENTION_DAYS: '14' }).photo === 9, 'retention env');
assert(retentionDays({ PHOTO_RETENTION_DAYS: '0' }).photo === 7, 'retention clamp');
assert(retentionDays({ PUBLIC_VIDEO_RETENTION_DAYS: '21' }).video === 21, 'public retention fallback');

await expectCode(() => photoObjectKey('../etc', 'job_a', 0, 'jpg'), 'storage_error');
await expectCode(() => assertObjectKey('templates/demo.mp4'), 'storage_error');
await expectCode(() => assertObjectKey('uploads/u_a/job_a/../0.jpg'), 'storage_error');
const key = photoObjectKey('u_alice', 'job_abc', 1, 'png');
assert(key === 'uploads/u_alice/job_abc/1.png', key);
const slot2 = photoObjectKey('u_alice', 'job_abc', 2, 'jpg');
const slot3 = photoObjectKey('u_alice', 'job_abc', 3, 'png');
const slot4 = photoObjectKey('u_alice', 'job_abc', 4, 'webp');
assert(slot2 === 'uploads/u_alice/job_abc/2.jpg', slot2);
assert(slot3 === 'uploads/u_alice/job_abc/3.png', slot3);
assert(slot4 === 'uploads/u_alice/job_abc/4.webp', slot4);
assert(assertObjectKey(slot2) === slot2 && assertObjectKey(slot3) === slot3 && assertObjectKey(slot4) === slot4, 'slots 2-4');
await expectCode(() => photoObjectKey('u_alice', 'job_abc', 5, 'jpg'), 'bad_photo');
await expectCode(() => assertObjectKey('uploads/u_alice/job_abc/5.jpg'), 'storage_error');
await expectCode(() => assertObjectKey('uploads/u_alice/job_abc/../4.webp'), 'storage_error');
assert(resultObjectKey('u_alice', 'job_abc') === 'results/u_alice/job_abc.mp4', 'result key');

const secret = 'media-test-secret-1';
const exp = Math.floor(Date.now() / 1000) + 3600;
const signed = await signMediaQuery(secret, { jobId: 'job_abc', kind: 'result', exp });
assert(await verifyMediaQuery(secret, { jobId: 'job_abc', kind: 'result', exp: String(signed.exp), sig: signed.sig }), 'sig');
assert(
  !(await verifyMediaQuery(secret, { jobId: 'job_abc', kind: 'photo', exp: String(signed.exp), sig: signed.sig })),
  'cross kind',
);
const tampered = signed.sig.slice(0, -1) + (signed.sig.endsWith('0') ? '1' : '0');
assert(!(await verifyMediaQuery(secret, { jobId: 'job_abc', kind: 'result', exp: String(signed.exp), sig: tampered })), 'tamper');
assert(
  !(await verifyMediaQuery(secret, { jobId: 'job_abc', kind: 'result', exp: String(signed.exp), sig: signed.sig }, exp + 10)),
  'expired',
);

const toml = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
assert(toml.includes(`binding = "${BINDING_NAME}"`), 'binding');
assert(toml.includes(`bucket_name = "${BUCKET_NAME}"`), 'bucket');
const site = fs.readFileSync(new URL('../src/lib/site.ts', import.meta.url), 'utf8');
assert(site.includes('r2Configured'), 'site flag');
assert(getTemplate('kiss-cam').photoCount === 2 && getTemplate('bby-wow').photoCount === 1, 'photo counts');
for (const name of JOB_MEDIA_COLUMNS) assert(site.length > 0 && name, name);

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

const baseline = fs.readFileSync(new URL('../migrations/0001_account.sql', import.meta.url), 'utf8');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(baseline);
const db = wrap(sqlite);
await ensureSchema(db);
const cols = new Set(sqlite.prepare(`PRAGMA table_info(jobs)`).all().map((row) => row.name));
for (const name of JOB_MEDIA_COLUMNS) assert(cols.has(name), `upgrade missing ${name}`);
const taskIndex = sqlite.prepare(`PRAGMA index_list(jobs)`).all().find((row) => row.name === 'idx_jobs_provider_task_id');
assert(taskIndex && Number(taskIndex.unique) === 1, 'upgrade missed the unique task index');
await ensureMediaColumns(db);

const user = { user_id: 'u_alice', email: 'alice@example.com', name: 'Alice' };
const origin = 'https://viral-templates.pages.dev';
const request = new Request(`${origin}/api/jobs`, { method: 'POST' });
const bucket = mockBucket();
const env = { MEDIA: bucket, AUTH_SECRET: secret, PHOTO_RETENTION_DAYS: '7', VIDEO_RETENTION_DAYS: '30' };

const jsonReq = new Request(`${origin}/api/jobs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    template_slug: 'bby-wow',
    photos: [`data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`],
  }),
});
const parsedJson = await readCreateJobBody(jsonReq);
assert(parsedJson.template_slug === 'bby-wow' && parsedJson.photos.length === 1, 'json photos');

const form = new FormData();
form.set('template_slug', 'kiss-cam');
form.set('photo_0', new Blob([jpeg], { type: 'image/jpeg' }), 'a.jpg');
form.set('photo_1', new Blob([png], { type: 'image/png' }), 'b.png');
const formReq = new Request(`${origin}/api/jobs`, { method: 'POST', body: form });
const parsedForm = await readCreateJobBody(formReq);
assert(parsedForm.photos.length === 2 && parsedForm.photos[1].ext === 'png', 'multipart photos');

const before = sqlite.prepare(`SELECT COUNT(*) AS n FROM jobs`).get().n;
await expectCode(
  () =>
    queueJobWithMedia({
      db,
      env,
      request,
      user,
      templateSlug: 'bby-wow',
      photos: [{ bytes: html, contentType: 'text/html', ext: 'jpg' }],
    }),
  'bad_photo',
);
assert(sqlite.prepare(`SELECT COUNT(*) AS n FROM jobs`).get().n === before, 'bad photo stored a job');

await expectCode(
  () =>
    queueJobWithMedia({
      db,
      env,
      request,
      user,
      templateSlug: 'bby-wow',
      photos: [{ bytes: probeImage('jpeg', 200, 400), contentType: 'image/jpeg', ext: 'jpg' }],
    }),
  'photo_too_small',
);
await expectCode(
  () =>
    queueJobWithMedia({
      db,
      env,
      request,
      user,
      templateSlug: 'bby-wow',
      photos: [{ bytes: probeImage('jpeg', 2000, 400), contentType: 'image/jpeg', ext: 'jpg' }],
    }),
  'photo_aspect',
);
const broke = await queueJobWithMedia({
  db,
  env,
  request,
  user,
  templateSlug: 'bby-wow',
  photos: [{ bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' }],
}).then(
  () => null,
  (err) => err,
);
assert(broke && broke.code === 'insufficient_credits', `expected insufficient_credits, got ${broke && broke.code}`);
const bbyCost = getTemplate('bby-wow').creditCost;
const tinyCost = getTemplate('tiny-desk').creditCost;
assert(bbyCost === 6 && tinyCost === 18 && getTemplate('kiss-cam').creatable === false, `source credits ${bbyCost}/${tinyCost}`);
assert(broke.needed === bbyCost && broke.balance === 0, 'credit error details');
await appendLedger(db, user, {
  delta: 100,
  kind: 'topup',
  label_en: 'Test pack',
  label_zh: '测试包',
});

await expectCode(
  () =>
    queueJobWithMedia({
      db,
      env,
      request,
      user,
      templateSlug: 'kiss-cam',
      photos: [{ bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' }],
    }),
  'template_retired',
);

const unbound = await queueJobWithMedia({
  db,
  env: { AUTH_SECRET: secret },
  request,
  user,
  templateSlug: 'bby-wow',
  photos: [{ bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' }],
});
assert(unbound.job.status === 'queued' && unbound.job.result_url == null, 'unbound job');
assert(unbound.media.stored === false && unbound.media.error === 'r2_unbound' && unbound.media.r2_configured === false, 'unbound flag');
const unboundRow = sqlite.prepare(`SELECT upload_key, result_url FROM jobs WHERE id = ?`).get(unbound.job.id);
assert(unboundRow.upload_key == null && unboundRow.result_url == null, 'unbound wrote a key');

const queued = await queueJobWithMedia({
  db,
  env,
  request,
  user,
  templateSlug: 'bby-wow',
  photos: parsedJson.photos,
});
assert(queued.job.status === 'queued' && queued.job.result_url == null, 'stored job still queued');
assert(queued.media.stored === true && queued.media.photos === 1 && queued.media.r2_configured === true, 'stored flag');
assert(queued.media.credits === bbyCost, 'bby cost');
const afterCharge = await getCredits(db, user, { includeLedger: false });
assert(afterCharge.balance === 100 - bbyCost, `charged balance ${afterCharge.balance}`);
assert(!('upload_key' in queued.job), 'key leaked on job json');
const storedRow = sqlite.prepare(`SELECT upload_key, upload_url, upload_key_2, status, result_url FROM jobs WHERE id = ?`).get(queued.job.id);
assert(storedRow.status === 'queued' && storedRow.result_url == null, 'db status');
assert(storedRow.upload_key === `uploads/u_alice/${queued.job.id}/0.jpg`, storedRow.upload_key);
assert(storedRow.upload_url.includes(`/api/media/jobs/${queued.job.id}/photo`) && storedRow.upload_url.includes('sig='), storedRow.upload_url);
assert(storedRow.upload_key_2 == null, 'extra photo key');
const savedPhoto = bucket.objects.get(storedRow.upload_key);
assert(savedPhoto && savedPhoto.opts.customMetadata.retention_days === '7', 'photo retention meta');
const photoExp = Date.parse(savedPhoto.opts.customMetadata.expires_at);
assert(photoExp > Date.now() + 6 * 86400000 && photoExp < Date.now() + 8 * 86400000, 'photo expiry window');

const pair = await queueJobWithMedia({
  db,
  env,
  request,
  user,
      templateSlug: 'tiny-desk',
      photos: parsedForm.photos,
});
const pairRow = sqlite.prepare(`SELECT upload_key, upload_key_2 FROM jobs WHERE id = ?`).get(pair.job.id);
assert(pairRow.upload_key.endsWith('/0.jpg') && pairRow.upload_key_2.endsWith('/1.png'), 'two keys');
assert(pair.job.status === 'queued', 'tiny desk queued');
const afterPair = await getCredits(db, user, { includeLedger: false });
assert(afterPair.balance === 100 - bbyCost - tinyCost, `tiny balance ${afterPair.balance}`);

const band = await queueJobWithMedia({
  db,
  env,
  request,
  user,
  templateSlug: 'tiny-desk',
  photos: [
    { bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' },
    { bytes: png, contentType: 'image/png', ext: 'png' },
    { bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' },
    { bytes: png, contentType: 'image/png', ext: 'png' },
    { bytes: webp, contentType: 'image/webp', ext: 'webp' },
  ],
});
assert(band.media.stored === true && band.media.photos === 5 && band.job.status === 'queued', 'five photo tiny desk');
const bandRow = sqlite
  .prepare(`SELECT upload_key, upload_key_2, extra_upload_keys FROM jobs WHERE id = ?`)
  .get(band.job.id);
assert(bandRow.upload_key.endsWith('/0.jpg') && bandRow.upload_key_2.endsWith('/1.png'), 'band slots 0-1');
const extraKeys = JSON.parse(bandRow.extra_upload_keys);
assert(
  Array.isArray(extraKeys) &&
    extraKeys.length === 3 &&
    extraKeys[0].endsWith('/2.jpg') &&
    extraKeys[1].endsWith('/3.png') &&
    extraKeys[2].endsWith('/4.webp'),
  `extra slots ${bandRow.extra_upload_keys}`,
);
for (const storedKey of [bandRow.upload_key, bandRow.upload_key_2, ...extraKeys]) {
  assert(bucket.objects.has(storedKey), `missing ${storedKey}`);
}
const afterBand = await getCredits(db, user, { includeLedger: false });
assert(afterBand.balance === 100 - bbyCost - tinyCost * 2, `five photo balance ${afterBand.balance}`);

let puts = 0;
const flakyObjects = new Map();
const flaky = {
  objects: flakyObjects,
  async put(key, value, opts) {
    puts += 1;
    if (puts === 2) throw new Error('disk');
    flakyObjects.set(key, { bytes: value, opts });
  },
  async get(key) {
    return flakyObjects.get(key) || null;
  },
  async delete(key) {
    flakyObjects.delete(key);
  },
};
await expectCode(
  () =>
    queueJobWithMedia({
      db,
      env: { ...env, MEDIA: flaky },
      request,
      user,
      templateSlug: 'tiny-desk',
      photos: parsedForm.photos,
    }),
  'storage_error',
);
assert(flakyObjects.size === 0, 'orphan object left after failed queue');

const ready = await storeJobResult(db, env, request, queued.job.id, { bytes: mp4, contentType: 'video/mp4', ext: 'mp4' });
assert(ready.job.status === 'ready', ready.job.status);
assert(ready.job.result_url.includes(`/api/media/jobs/${queued.job.id}/result`), ready.job.result_url);
assert(ready.record.result_key === `results/u_alice/${queued.job.id}.mp4`, ready.record.result_key);
assert(!/fal|kling|waffo/i.test(ready.job.note_en), ready.job.note_en);
const savedVideo = bucket.objects.get(ready.record.result_key);
assert(savedVideo.opts.customMetadata.retention_days === '30', 'video retention');
assert(savedVideo.opts.httpMetadata.contentType === 'video/mp4', 'mp4 type');
assert(new TextDecoder().decode(savedVideo.bytes).includes('trainedAlgorithmicMedia'), 'result missing AI label');

const listed = await listJobs(db, user, { status: 'ready', signResult: resultUrlSigner(env, request) });
assert(listed.jobs.length === 1, `ready list ${listed.jobs.length}`);
assert(listed.jobs[0].result_url.includes('exp=') && listed.jobs[0].result_url.includes('sig='), listed.jobs[0].result_url);
assert(!('result_key' in listed.jobs[0]) && !('upload_key' in listed.jobs[0]), 'list leaked keys');

const stillQueued = sqlite.prepare(`SELECT status FROM jobs WHERE id = ?`).get(unbound.job.id);
await expectCode(
  () => storeJobResult(db, { AUTH_SECRET: secret }, request, unbound.job.id, { bytes: mp4 }),
  'r2_unbound',
);
assert(sqlite.prepare(`SELECT status FROM jobs WHERE id = ?`).get(unbound.job.id).status === stillQueued.status, 'unbound ingest changed status');

await expectCode(() => storeJobResult(db, env, request, 'missing', { bytes: mp4 }), 'not_found');
await expectCode(
  () => attachJobResult(db, queued.job.id, { result_key: 'results/nope/job.mp4', result_url: 'https://evil.example/x.mp4' }),
  'storage_error',
);

const pastKey = photoObjectKey('u_alice', 'job_expired1', 0, 'jpg');
await putMedia(bucket, pastKey, jpeg, {
  contentType: 'image/jpeg',
  customMetadata: { expires_at: new Date(Date.now() - 5000).toISOString(), kind: 'upload' },
});
assert((await loadStoredObject(bucket, pastKey)) == null, 'expired object served');
assert(!bucket.objects.has(pastKey), 'expired object kept');

const bare = new Request(`${origin}/api/media/jobs/${queued.job.id}/result`);
const authedCookie = await issueSessionCookie(bare, env, user);
const authed = new Request(bare.url, { headers: { cookie: authedCookie.split(';')[0] } });
assert((await authorizeMediaRequest(env, authed, ready.record, 'result')) === 'owner', 'owner');
const signedUrl = new URL(ready.job.result_url);
const signedReq = new Request(signedUrl);
assert((await authorizeMediaRequest(env, signedReq, ready.record, 'result')) === 'signed', 'signed download');
signedUrl.searchParams.set('sig', tampered);
await expectCode(() => authorizeMediaRequest(env, new Request(signedUrl), ready.record, 'result'), 'forbidden');
await expectCode(
  () => authorizeMediaRequest(env, bare, { id: queued.job.id, user_id: 'u_other' }, 'result'),
  'unauthorized',
);

assert(ingestAuthorized({}, new Request(origin)) === 'unconfigured', 'ingest unset');
assert(ingestAuthorized({ RESULT_INGEST_SECRET: 'short' }, new Request(origin)) === 'unconfigured', 'ingest short');
const ingest = 'ingest-secret-value';
assert(
  ingestAuthorized({ RESULT_INGEST_SECRET: ingest }, new Request(origin, { headers: { authorization: `Bearer ${ingest}` } })) ===
    'ok',
  'ingest ok',
);
assert(
  ingestAuthorized(
    { RESULT_INGEST_SECRET: ingest },
    new Request(origin, { headers: { authorization: 'Bearer nope-nope-nope-no' } }),
  ) === 'unauthorized',
  'ingest bad',
);

const download = mediaDownloadUrl(origin, 'job_abc', 'photo', signed);
assert(download.startsWith(`${origin}/api/media/jobs/job_abc/photo?`), download);

console.log('r2 media tests passed');
