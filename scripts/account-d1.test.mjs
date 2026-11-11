import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { JOB_MEDIA_COLUMNS, JOB_PROVIDER_COLUMNS, SCHEMA_SQL, schemaStatements } from '../functions/_lib/schema.js';
import { appendLedger, chargeJobCredits, createStubJob, getCredits, listJobs, markJobFailed, templateCreditCost } from '../functions/_lib/account-db.js';
import { creditsForDuration, getTemplate } from '../functions/_lib/templates.js';

const baseline = fs.readFileSync(new URL('../migrations/0001_account.sql', import.meta.url), 'utf8').trim();
const alter = fs.readFileSync(new URL('../migrations/0002_r2_media.sql', import.meta.url), 'utf8');
if (baseline.includes('upload_key')) {
  console.error('0001 is already applied remotely; add media columns in 0002, not 0001');
  process.exit(1);
}
for (const table of ['users', 'credit_accounts', 'credit_ledger', 'jobs']) {
  const marker = `CREATE TABLE IF NOT EXISTS ${table}`;
  if (!baseline.includes(marker) || !SCHEMA_SQL.includes(marker)) {
    console.error('schema drift: missing ' + table);
    process.exit(1);
  }
}
for (const name of JOB_MEDIA_COLUMNS) {
  if (!SCHEMA_SQL.includes(name) || !alter.includes(`ADD COLUMN ${name} TEXT`)) {
    console.error('media column missing from fresh schema or 0002: ' + name);
    process.exit(1);
  }
}
const taskMigration = fs.readFileSync(new URL('../migrations/0003_bailian_task.sql', import.meta.url), 'utf8');
if (baseline.includes('provider_task_id')) {
  console.error('0001 is already applied remotely; add provider_task_id in 0003, not 0001');
  process.exit(1);
}
for (const name of JOB_PROVIDER_COLUMNS) {
  if (!SCHEMA_SQL.includes(name) || !taskMigration.includes(`ADD COLUMN ${name}`)) {
    console.error('provider column missing from fresh schema or 0003: ' + name);
    process.exit(1);
  }
}
const uniqueMigration = fs.readFileSync(new URL('../migrations/0005_provider_task_unique.sql', import.meta.url), 'utf8');
if (!/CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_provider_task_id\s+ON jobs \(provider_task_id\)/.test(uniqueMigration)) {
  console.error('0005 must add a unique index on provider_task_id');
  process.exit(1);
}
if (/UPDATE\s+jobs/i.test(uniqueMigration) || /DELETE\s+FROM\s+jobs/i.test(uniqueMigration)) {
  console.error('0005 must not rewrite job rows');
  process.exit(1);
}
if (!SCHEMA_SQL.includes('idx_jobs_provider_task_id')) {
  console.error('fresh schema missing provider task unique index');
  process.exit(1);
}
if (schemaStatements().length < 7) {
  console.error('schema splitter dropped statements');
  process.exit(1);
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

function assert(cond, message) {
  if (!cond) throw new Error(message);
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

const sqlite = new DatabaseSync(':memory:');
const db = wrap(sqlite);
const userA = { user_id: 'u_alice', email: 'alice@example.com', name: 'Alice' };
const userB = { user_id: 'u_bob', email: 'bob@example.com', name: 'Bob' };

const empty = await getCredits(db, userA);
assert(empty.balance === 0 && empty.ledger.length === 0, 'new account is empty');

const none = await listJobs(db, userA);
assert(none.total === 0 && none.jobs.length === 0, 'no jobs yet');

await expectCode(() => createStubJob(db, userA, 'not-a-template'), 'bad_template');

const job = await createStubJob(db, userA, 'BBY-WOW');
assert(job.status === 'queued', job.status);
assert(job.result_url == null, 'stub has a media url');
assert(job.template_slug === 'bby-wow', job.template_slug);
assert(job.template_name === 'Bby Wow AI', job.template_name);
assert(!/mp4/i.test(job.note_en), job.note_en);
assert(!/demo/i.test(job.note_en), job.note_en);

const afterJob = await getCredits(db, userA);
assert(afterJob.balance === 0, 'stub job charged credits');

await new Promise((resolve) => setTimeout(resolve, 5));
const second = await createStubJob(db, userA, 'kiss-cam');
assert(second.status === 'queued' && second.result_url == null, 'second job');

const list = await listJobs(db, userA);
assert(list.total === 2, `total ${list.total}`);
assert(list.jobs[0].id === second.id, 'newest first');
assert(list.jobs.every((row) => row.status !== 'ready' && !row.result_url), 'no ready media in list');

const limited = await listJobs(db, userA, { status: 'queued', limit: 1 });
assert(limited.total === 2 && limited.jobs.length === 1, 'filter limit');
const ready = await listJobs(db, userA, { status: 'ready' });
assert(ready.total === 0 && ready.jobs.length === 0, 'ready filter');
await expectCode(() => listJobs(db, userA, { status: 'done' }), 'bad_status');
await expectCode(() => listJobs(db, userA, { limit: 0 }), 'bad_limit');

const other = await listJobs(db, userB);
assert(other.total === 0, 'other user sees jobs');

const topup = await appendLedger(db, userA, {
  id: 'tx_topup',
  delta: 15,
  kind: 'topup',
  label_en: 'Starter pack',
  label_zh: '入门包',
});
assert(topup.balance === 15, `topup balance ${topup.balance}`);
const deduct = await appendLedger(db, userA, {
  id: 'tx_deduct',
  delta: -1,
  kind: 'deduction',
  label_en: 'Generate attempt',
  label_zh: '生成尝试',
  job_id: job.id,
});
assert(deduct.balance === 14, `deduct balance ${deduct.balance}`);
const refund = await appendLedger(db, userA, {
  id: 'tx_refund',
  delta: 1,
  kind: 'refund',
  label_en: 'Refund',
  label_zh: '退还',
  job_id: job.id,
});
assert(refund.balance === 15, `refund balance ${refund.balance}`);
await expectCode(
  () =>
    appendLedger(db, userA, {
      id: 'tx_over',
      delta: -100,
      kind: 'deduction',
      label_en: 'Too much',
      label_zh: '超额',
    }),
  'insufficient_credits',
);

const credits = await getCredits(db, userA);
assert(credits.balance === 15, `balance ${credits.balance}`);
assert(credits.ledger.map((row) => row.kind).sort().join() === 'deduction,refund,topup', 'ledger kinds');
assert(!credits.ledger.some((row) => row.id === 'tx_over'), 'overdraft stored');
const bob = await getCredits(db, userB);
assert(bob.balance === 0 && bob.ledger.length === 0, 'bob balance leaked');

const still = await getCredits(db, userA);
assert(still.balance === 15, 'balance changed after a later job check');
await createStubJob(db, userA, 'ceiling-fan');
const unchanged = await getCredits(db, userA, { includeLedger: false });
assert(unchanged.balance === 15 && unchanged.ledger.length === 0, 'ledger=0 or balance drift');

let blocked = false;
try {
  sqlite
    .prepare(
      `INSERT INTO jobs (
        id, user_id, template_slug, template_name, template_name_zh, status, result_url,
        error_code, note_en, note_zh, created_at, updated_at
      ) VALUES ('job_bad_url', 'u_alice', 'bby-wow', 'Bby Wow AI', 'Bby Wow AI', 'queued', 'https://example.com/fake.mp4', NULL, '', '', 't', 't')`,
    )
    .run();
} catch {
  blocked = true;
}
assert(blocked, 'queued job accepted a media url');

sqlite
  .prepare(
    `INSERT INTO jobs (
      id, user_id, template_slug, template_name, template_name_zh, status, result_url,
      error_code, note_en, note_zh, created_at, updated_at
    ) VALUES ('job_ready_real', 'u_alice', 'bby-wow', 'Bby Wow AI', 'Bby Wow AI', 'ready', 'https://example.com/real.mp4', NULL, 'Ready file', '成片', 't', 't')`,
  )
  .run();
const readyRows = await listJobs(db, userA, { status: 'ready' });
assert(readyRows.jobs.length === 1 && readyRows.jobs[0].result_url === 'https://example.com/real.mp4', 'ready url hidden');
const queuedRows = await listJobs(db, userA, { status: 'queued' });
assert(queuedRows.jobs.every((row) => row.result_url == null), 'queued url leaked');

assert(creditsForDuration(6.041667) === 6, 'bby round');
assert(creditsForDuration(15.278005) === 15, 'fan round');
assert(creditsForDuration(0.2) === 1, 'minimum credit');
assert(creditsForDuration(0) === 0 && creditsForDuration(null) === 0, 'no duration');
const bby = getTemplate('bby-wow');
const kiss = getTemplate('kiss-cam');
const fan = getTemplate('ceiling-fan');
assert(bby.durationSeconds === 6.041667 && bby.creditCost === 6, 'bby duration');
assert(kiss.durationSeconds === 6.041667 && kiss.creditCost === 6, 'kiss duration');
assert(fan.durationSeconds === 15.278005 && fan.creditCost === 15, 'fan duration');
assert(templateCreditCost({ durationSeconds: 6.041667, creditCost: 99 }) === 6, 'duration wins');
assert(templateCreditCost({ creditCost: 10 }) === 0, 'stale cost is not charged');
for (const slug of ['bulin-47', 'zombie-love', 'smalltown-boy-cats', 'clapping-cat', 'knight-cat', 'car-jump']) {
  const row = getTemplate(slug);
  assert(row.durationSeconds == null && row.creditCost === 0 && templateCreditCost(row) === 0, slug);
}
const priced = await createStubJob(db, userA, 'bby-wow');
const charge = await chargeJobCredits(db, userA, priced.id, bby);
assert(charge.balance === 15 - bby.creditCost && charge.delta === -bby.creditCost, `charge ${charge.balance}`);
const again = await chargeJobCredits(db, userA, priced.id, bby);
assert(again.already === true && again.balance === 15 - bby.creditCost, 'second charge moved the balance');
await expectCode(
  () => chargeJobCredits(db, userB, 'job_bobcharge01', getTemplate('bby-wow')),
  'insufficient_credits',
);
assert((await getCredits(db, userB, { includeLedger: false })).balance === 0, 'bob was charged');
const failed = await markJobFailed(db, priced.id, { error_code: 'failed' });
assert(failed === true, 'priced job did not fail');
const restored = await getCredits(db, userA);
assert(restored.balance === 15, `refund balance ${restored.balance}`);
assert(restored.ledger.filter((row) => row.job_id === priced.id).map((row) => row.kind).sort().join() === 'deduction,refund', 'charge pair');
const secondFail = await markJobFailed(db, priced.id, { error_code: 'failed' });
assert(secondFail === false, 'second fail changed the row');
assert((await getCredits(db, userA, { includeLedger: false })).balance === 15, 'refunded twice');

console.log('account d1 tests passed');
