import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { JOB_MEDIA_COLUMNS, SCHEMA_SQL, schemaStatements } from '../functions/_lib/schema.js';
import { appendLedger, createStubJob, getCredits, listJobs } from '../functions/_lib/account-db.js';

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

console.log('account d1 tests passed');
