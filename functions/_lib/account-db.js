import { JOB_MEDIA_COLUMNS, JOB_PROVIDER_COLUMNS, PIPELINE_JOB_COLUMNS, SCHEMA_SQL, schemaStatements } from './schema.js';
import { creditsForDuration, getTemplate } from './templates.js';

const JOB_STATUSES = new Set(['queued', 'running', 'ready', 'failed']);
const LEDGER_KINDS = new Set(['topup', 'deduction', 'refund']);

export const QUEUED_NOTE_EN = 'Queued. Generation starts shortly. The clip shows here when it is ready.';
export const QUEUED_NOTE_ZH = '已排队。即将开始生成。完成后成片会出现在这里。';
const STUB_NOTE_EN = QUEUED_NOTE_EN;
const STUB_NOTE_ZH = QUEUED_NOTE_ZH;
const START_NOTE_EN = 'Starting video generation.';
const START_NOTE_ZH = '正在开始生成视频。';
const RUNNING_NOTE_EN = 'Generating your clip.';
const RUNNING_NOTE_ZH = '正在生成短片。';

let schemaReady = false;

export function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

export function getDb(env) {
  const db = env && env.DB;
  if (!db || typeof db.prepare !== 'function') return null;
  return db;
}

export function newId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

function oneLine(value, max) {
  return String(value || '')
    .replace(/[\r\n\u0000]/g, '')
    .trim()
    .slice(0, max);
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(text)) return '';
  return text;
}

function assertUser(user) {
  const userId = cleanId(user && user.user_id);
  if (!userId) throw fail('unauthorized');
  return {
    user_id: userId,
    email: oneLine(user.email, 200),
    name: oneLine(user.name, 80),
  };
}

export async function ensureMediaColumns(db) {
  const info = await db.prepare(`PRAGMA table_info(jobs)`).all();
  const have = new Set((info.results || []).map((row) => String(row.name)));
  if (!have.has('id')) return;
  for (const name of [...JOB_MEDIA_COLUMNS, ...JOB_PROVIDER_COLUMNS, ...PIPELINE_JOB_COLUMNS]) {
    if (have.has(name)) continue;
    if (!/^[a-z0-9_]+$/.test(name)) throw fail('storage_error');
    try {
      await db.prepare(`ALTER TABLE jobs ADD COLUMN ${name} TEXT`).run();
    } catch (err) {
      const message = String(err && err.message ? err.message : err);
      if (!/duplicate column/i.test(message)) throw err;
    }
    have.add(name);
  }
}

function errorText(err) {
  return [err && err.message, err && err.cause && err.cause.message].filter(Boolean).join(' ');
}

const PROVIDER_TASK_UNIQUE_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_provider_task_id ON jobs (provider_task_id)`;

async function ensureProviderTaskUnique(db) {
  try {
    await db.prepare(PROVIDER_TASK_UNIQUE_SQL).run();
  } catch (err) {
    // A leftover duplicate must not take down every request. saveProviderTask
    // still refuses to attach an id that another job already has.
    console.error('provider_task_unique', errorText(err).slice(0, 200));
  }
}

export async function ensureSchema(db) {
  if (schemaReady) return;
  for (const sql of schemaStatements(SCHEMA_SQL)) {
    try {
      await db.prepare(sql).run();
    } catch (err) {
      const message = errorText(err);
      const providerIndex = /idx_jobs_provider_task_id/i.test(sql);
      // The column is added just below on databases that predate provider_task_id.
      if (providerIndex && /no such column/i.test(message)) continue;
      if (providerIndex && /unique constraint failed/i.test(message)) {
        console.error('provider_task_unique', message.slice(0, 200));
        continue;
      }
      throw err;
    }
  }
  await ensureMediaColumns(db);
  await ensureProviderTaskUnique(db);
  schemaReady = true;
}

export async function ensureUser(db, user) {
  const row = assertUser(user);
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (user_id, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           updated_at = excluded.updated_at`,
      )
      .bind(row.user_id, row.email, row.name, now, now),
    db
      .prepare(
        `INSERT INTO credit_accounts (user_id, balance, updated_at)
         VALUES (?, 0, ?)
         ON CONFLICT(user_id) DO NOTHING`,
      )
      .bind(row.user_id, now),
  ]);
  return row;
}

/** Oldest users row for this address, if one exists. Does not create a row. */
export async function findUserByEmail(db, email) {
  const normalized = oneLine(email, 200).toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT user_id, email, name
       FROM users
       WHERE lower(email) = ?
       ORDER BY created_at ASC, user_id ASC
       LIMIT 1`,
    )
    .bind(normalized)
    .first();
  if (!row || typeof row.user_id !== 'string' || !row.user_id) return null;
  return {
    user_id: String(row.user_id),
    email: oneLine(row.email, 200).toLowerCase() || normalized,
    name: oneLine(row.name, 80),
  };
}

export function publicResultUrl(status, raw) {
  if (status !== 'ready' || typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function mapJob(row, resultUrlOverride) {
  const status = JOB_STATUSES.has(row.status) ? row.status : 'failed';
  return {
    id: String(row.id),
    template_slug: String(row.template_slug || ''),
    template_name: String(row.template_name || ''),
    template_name_zh: String(row.template_name_zh || ''),
    status,
    result_url: publicResultUrl(status, resultUrlOverride || row.result_url),
    note_en: String(row.note_en || ''),
    note_zh: String(row.note_zh || ''),
    created_at: String(row.created_at || ''),
  };
}

function mapLedger(row) {
  const kind = LEDGER_KINDS.has(row.kind) ? row.kind : 'topup';
  return {
    id: String(row.id),
    delta: Number(row.delta),
    kind,
    label_en: String(row.label_en || ''),
    label_zh: String(row.label_zh || ''),
    job_id: row.job_id ? String(row.job_id) : null,
    created_at: String(row.created_at || ''),
  };
}

const JOB_COLUMNS = `id, template_slug, template_name, template_name_zh, status, result_url, note_en, note_zh, created_at`;
const JOB_LIST_COLUMNS = `${JOB_COLUMNS}, result_key`;

export async function listJobs(db, user, options = {}) {
  const row = await ensureUser(db, user);
  const status = typeof options.status === 'string' ? options.status.trim() : '';
  if (status && !JOB_STATUSES.has(status)) throw fail('bad_status');
  const limit = clampLimit(options.limit, 50);
  const countRow = status
    ? await db
        .prepare(`SELECT COUNT(*) AS total FROM jobs WHERE user_id = ? AND status = ?`)
        .bind(row.user_id, status)
        .first()
    : await db.prepare(`SELECT COUNT(*) AS total FROM jobs WHERE user_id = ?`).bind(row.user_id).first();
  const listed = status
    ? await db
        .prepare(
          `SELECT ${JOB_LIST_COLUMNS} FROM jobs
           WHERE user_id = ? AND status = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .bind(row.user_id, status, limit)
        .all()
    : await db
        .prepare(
          `SELECT ${JOB_LIST_COLUMNS} FROM jobs
           WHERE user_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .bind(row.user_id, limit)
        .all();
  const jobs = [];
  for (const jobRow of listed.results || []) {
    let override = null;
    if (jobRow.status === 'ready' && jobRow.result_key && typeof options.signResult === 'function') {
      try {
        override = await options.signResult(jobRow);
      } catch (err) {
        console.error('result_sign', err && err.code ? err.code : 'error');
      }
    }
    jobs.push(mapJob(jobRow, override));
  }
  return { jobs, total: Number(countRow && countRow.total ? countRow.total : 0) };
}

export function clampLimit(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw fail('bad_limit');
  return n;
}

/**
 * Append a top-up, deduction, or refund and move the stored balance with it.
 * Generate charges and failure refunds call this. A duplicate id is the same
 * entry again: the balance is not moved twice.
 */
export async function appendLedger(db, user, entry) {
  const row = await ensureUser(db, user);
  const delta = entry && entry.delta;
  const kind = entry && entry.kind;
  if (!Number.isInteger(delta) || delta === 0) throw fail('bad_delta');
  if (!LEDGER_KINDS.has(kind)) throw fail('bad_kind');
  if ((kind === 'topup' || kind === 'refund') && delta <= 0) throw fail('bad_delta');
  if (kind === 'deduction' && delta >= 0) throw fail('bad_delta');
  const labelEn = oneLine(entry.label_en, 160);
  const labelZh = oneLine(entry.label_zh, 160);
  if (!labelEn || !labelZh) throw fail('bad_label');
  let jobId = null;
  if (entry.job_id != null && entry.job_id !== '') {
    jobId = cleanId(entry.job_id);
    if (!jobId) throw fail('bad_job');
  }
  const id = entry.id ? cleanId(entry.id) : newId('tx');
  if (!id) throw fail('bad_job');
  const now = entry.created_at || new Date().toISOString();
  const beforeRow = await db.prepare(`SELECT balance FROM credit_accounts WHERE user_id = ?`).bind(row.user_id).first();
  const before = Number(beforeRow && beforeRow.balance != null ? beforeRow.balance : 0);

  const duplicate = await db.prepare(`SELECT id, delta, kind FROM credit_ledger WHERE id = ?`).bind(id).first();
  if (duplicate) {
    if (Number(duplicate.delta) !== delta || duplicate.kind !== kind) throw fail('storage_error');
    return {
      id,
      delta,
      kind,
      label_en: labelEn,
      label_zh: labelZh,
      job_id: jobId,
      created_at: now,
      balance: before,
      already: true,
    };
  }

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO credit_ledger (id, user_id, delta, kind, label_en, label_zh, job_id, created_at)
           SELECT ?, user_id, ?, ?, ?, ?, ?, ?
           FROM credit_accounts
           WHERE user_id = ? AND balance + ? >= 0`,
        )
        .bind(id, delta, kind, labelEn, labelZh, jobId, now, row.user_id, delta),
      db
        .prepare(
          `UPDATE credit_accounts
           SET balance = balance + ?, updated_at = ?
           WHERE user_id = ? AND EXISTS (SELECT 1 FROM credit_ledger WHERE id = ?)`,
        )
        .bind(delta, now, row.user_id, id),
    ]);
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    if (!/unique/i.test(message)) throw err;
    const raced = await db.prepare(`SELECT id FROM credit_ledger WHERE id = ? AND user_id = ?`).bind(id, row.user_id).first();
    if (!raced) throw err;
    const racedBalance = await db.prepare(`SELECT balance FROM credit_accounts WHERE user_id = ?`).bind(row.user_id).first();
    return {
      id,
      delta,
      kind,
      label_en: labelEn,
      label_zh: labelZh,
      job_id: jobId,
      created_at: now,
      balance: Number(racedBalance && racedBalance.balance != null ? racedBalance.balance : before),
      already: true,
    };
  }

  const ledgerRow = await db
    .prepare(`SELECT id FROM credit_ledger WHERE id = ? AND user_id = ?`)
    .bind(id, row.user_id)
    .first();
  const afterRow = await db.prepare(`SELECT balance FROM credit_accounts WHERE user_id = ?`).bind(row.user_id).first();
  const after = Number(afterRow && afterRow.balance != null ? afterRow.balance : 0);
  if (!ledgerRow || after !== before + delta) {
    if (ledgerRow) {
      await db.prepare(`DELETE FROM credit_ledger WHERE id = ? AND user_id = ?`).bind(id, row.user_id).run();
    }
    throw fail('insufficient_credits');
  }
  return {
    id,
    delta,
    kind,
    label_en: labelEn,
    label_zh: labelZh,
    job_id: jobId,
    created_at: now,
    balance: after,
  };
}

export async function getCredits(db, user, options = {}) {
  const row = await ensureUser(db, user);
  const account = await db
    .prepare(`SELECT balance FROM credit_accounts WHERE user_id = ?`)
    .bind(row.user_id)
    .first();
  const balance = Number(account && account.balance != null ? account.balance : 0);
  if (options.includeLedger === false) return { balance, ledger: [] };
  const listed = await db
    .prepare(
      `SELECT id, delta, kind, label_en, label_zh, job_id, created_at
       FROM credit_ledger
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
    )
    .bind(row.user_id)
    .all();
  return { balance, ledger: (listed.results || []).map(mapLedger) };
}

function cleanMediaKey(value, prefix) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw fail('storage_error');
  const key = value.trim();
  if (key.length > 240 || key.includes('..') || key.includes('\\') || !key.startsWith(prefix)) {
    throw fail('storage_error');
  }
  const photo = /^uploads\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[01]\.(jpg|png|webp)$/;
  const video = /^results\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.mp4$/;
  if (prefix === 'uploads/' && !photo.test(key)) throw fail('storage_error');
  if (prefix === 'results/' && !video.test(key)) throw fail('storage_error');
  return key;
}

function cleanMediaUrl(value, jobId, kind) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2000) throw fail('storage_error');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw fail('storage_error');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw fail('storage_error');
  }
  if (url.pathname !== `/api/media/jobs/${jobId}/${kind}`) throw fail('storage_error');
  return url.toString();
}

export async function getJobMediaRecord(db, jobId) {
  const id = cleanId(jobId);
  if (!id) return null;
  await ensureSchema(db);
  return db
    .prepare(
      `SELECT id, user_id, status, upload_key, upload_key_2, extra_upload_keys, pipeline_frame, upload_url, upload_url_2, result_key, result_url
       FROM jobs WHERE id = ?`,
    )
    .bind(id)
    .first();
}

function changesOf(result) {
  const n = result && result.meta && result.meta.changes;
  const value = Number(n);
  return Number.isFinite(value) ? value : 0;
}

function cleanTaskId(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  // Single provider ids fit in 80. A parallel split packs every piece into one
  // value (`m2_…`), which is longer and still matches this alphabet.
  if (!/^[A-Za-z0-9_-]{8,640}$/.test(text)) return '';
  return text;
}

const REMAKE_COLUMNS = `id, user_id, template_slug, status, upload_key, upload_key_2, extra_upload_keys, pipeline_frame, provider_task_id, error_code, updated_at`;

/**
 * Oldest running jobs first, then oldest queued jobs.
 * The worker claims these. Customer list APIs do not use this.
 */
export async function listRemakeCandidates(db, options = {}) {
  await ensureSchema(db);
  const jobId = options.jobId ? cleanId(options.jobId) : '';
  if (options.jobId && !jobId) throw fail('bad_job');
  const userId = options.userId ? cleanId(options.userId) : '';
  if (options.userId && !userId) throw fail('unauthorized');
  if (jobId) {
    const row = await db.prepare(`SELECT ${REMAKE_COLUMNS} FROM jobs WHERE id = ?`).bind(jobId).first();
    if (!row || (userId && row.user_id !== userId)) return [];
    return [row];
  }
  const limit = clampLimit(options.limit ?? 1, 1);
  const listed = userId
    ? await db
        .prepare(
          `SELECT ${REMAKE_COLUMNS} FROM jobs
           WHERE status IN ('queued', 'running') AND user_id = ?
           ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, created_at ASC, id ASC
           LIMIT ?`,
        )
        .bind(userId, limit)
        .all()
    : await db
        .prepare(
          `SELECT ${REMAKE_COLUMNS} FROM jobs
           WHERE status IN ('queued', 'running')
           ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, created_at ASC, id ASC
           LIMIT ?`,
        )
        .bind(limit)
        .all();
  return listed.results || [];
}

/** Move queued → running so two workers cannot submit the same job. */
export async function claimQueuedJob(db, jobId) {
  const id = cleanId(jobId);
  if (!id) return false;
  await ensureSchema(db);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE jobs
       SET status = 'running',
           error_code = 'submitting',
           note_en = ?,
           note_zh = ?,
           updated_at = ?
       WHERE id = ? AND status = 'queued' AND provider_task_id IS NULL`,
    )
    .bind(START_NOTE_EN, START_NOTE_ZH, now, id)
    .run();
  return changesOf(result) === 1;
}

function uniqueTaskConstraint(err) {
  return /unique constraint failed/i.test(errorText(err));
}

async function otherTaskOwner(db, task, jobId) {
  return db.prepare(`SELECT id FROM jobs WHERE provider_task_id = ? AND id <> ?`).bind(task, jobId).first();
}

/**
 * Attach a Bailian task id to this job and leave it running.
 * An id already stored on a different job is refused. A queued row is accepted
 * so a submit that finishes after a stale requeue can still store the id.
 * Failed and ready rows are left unchanged.
 */
export async function saveProviderTask(db, jobId, taskId) {
  const id = cleanId(jobId);
  const task = cleanTaskId(taskId);
  if (!id || !task) throw fail('storage_error');
  await ensureSchema(db);
  if (await otherTaskOwner(db, task, id)) throw fail('provider_task_taken');
  const now = new Date().toISOString();
  let result;
  try {
    result = await db
      .prepare(
        `UPDATE jobs
         SET status = 'running',
             provider_task_id = ?,
             error_code = NULL,
             note_en = ?,
             note_zh = ?,
             updated_at = ?
         WHERE id = ?
           AND status IN ('queued', 'running')
           AND provider_task_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM jobs AS other
             WHERE other.provider_task_id = ? AND other.id <> ?
           )`,
      )
      .bind(task, RUNNING_NOTE_EN, RUNNING_NOTE_ZH, now, id, task, id)
      .run();
  } catch (err) {
    if (uniqueTaskConstraint(err)) throw fail('provider_task_taken');
    throw err;
  }
  if (changesOf(result) === 1) return;
  if (await otherTaskOwner(db, task, id)) throw fail('provider_task_taken');
  throw fail('storage_error');
}

/**
 * Create was rate-limited or the provider connection failed before a task id
 * existed. Leave the job queued and remember how long to wait.
 * The code is internal. Customer notes stay the queued copy.
 */
export async function deferQueuedJob(db, jobId, errorCode) {
  const id = cleanId(jobId);
  const code = oneLine(errorCode, 80);
  if (!id || !/^retry_later_[1-9][0-9]{3,5}$/.test(code)) return false;
  await ensureSchema(db);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE jobs
       SET status = 'queued',
           error_code = ?,
           note_en = ?,
           note_zh = ?,
           updated_at = ?
       WHERE id = ? AND status = 'running' AND provider_task_id IS NULL`,
    )
    .bind(code, QUEUED_NOTE_EN, QUEUED_NOTE_ZH, now, id)
    .run();
  return changesOf(result) === 1;
}

/** Drop the current task id after a split piece is stored, before the next piece is submitted. */
export async function clearProviderTask(db, jobId, taskId) {
  const id = cleanId(jobId);
  const task = cleanTaskId(taskId);
  if (!id || !task) return false;
  await ensureSchema(db);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE jobs
       SET provider_task_id = NULL,
           error_code = NULL,
           updated_at = ?
       WHERE id = ? AND status = 'running' AND provider_task_id = ?`,
    )
    .bind(now, id, task)
    .run();
  return changesOf(result) === 1;
}

/** Poll was rate-limited. Keep the task id and do not call the provider again until the wait elapses. */
export async function noteRunningBackoff(db, jobId, errorCode) {
  const id = cleanId(jobId);
  const code = oneLine(errorCode, 80);
  if (!id || !/^retry_later_[1-9][0-9]{3,5}$/.test(code)) return false;
  await ensureSchema(db);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE jobs
       SET error_code = ?,
           updated_at = ?
       WHERE id = ? AND status = 'running' AND provider_task_id IS NOT NULL`,
    )
    .bind(code, now, id)
    .run();
  return changesOf(result) === 1;
}

/**
 * One in-flight provider poll for this job. The compare-and-swap on updated_at
 * drops a second caller so the browser and the drain cannot stampede.
 * The lease is the same retry_later_N code polls already honor.
 */
export async function claimProviderPoll(db, jobId, observedUpdatedAt, leaseMs) {
  const id = cleanId(jobId);
  const observed = typeof observedUpdatedAt === 'string' ? observedUpdatedAt : '';
  const lease = Number(leaseMs);
  if (!id || !observed || !Number.isInteger(lease) || lease < 1000 || lease > 60000) return false;
  const code = `retry_later_${lease}`;
  await ensureSchema(db);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE jobs
       SET error_code = ?,
           updated_at = ?
       WHERE id = ?
         AND status = 'running'
         AND provider_task_id IS NOT NULL
         AND updated_at = ?
         AND (error_code IS NULL OR error_code = 'submitting' OR error_code LIKE 'retry_later_%')`,
    )
    .bind(code, now, id, observed)
    .run();
  return changesOf(result) === 1;
}

/** Replace a packed split id after another piece is created. The row stays running. */
export async function replaceProviderTask(db, jobId, fromTask, toTask) {
  const id = cleanId(jobId);
  const from = cleanTaskId(fromTask);
  const to = cleanTaskId(toTask);
  if (!id || !from || !to || from === to) return false;
  await ensureSchema(db);
  if (await otherTaskOwner(db, to, id)) throw fail('provider_task_taken');
  const now = new Date().toISOString();
  let result;
  try {
    result = await db
      .prepare(
        `UPDATE jobs
         SET provider_task_id = ?,
             updated_at = ?
         WHERE id = ? AND status = 'running' AND provider_task_id = ?`,
      )
      .bind(to, now, id, from)
      .run();
  } catch (err) {
    if (uniqueTaskConstraint(err)) throw fail('provider_task_taken');
    throw err;
  }
  if (changesOf(result) === 1) return true;
  if (await otherTaskOwner(db, to, id)) throw fail('provider_task_taken');
  return false;
}

/** A later split piece was rate-limited. The finished pieces stay stored. */
export async function noteIdleBackoff(db, jobId, errorCode) {
  const id = cleanId(jobId);
  const code = oneLine(errorCode, 80);
  if (!id || !/^retry_later_[1-9][0-9]{3,5}$/.test(code)) return false;
  await ensureSchema(db);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE jobs
       SET error_code = ?,
           updated_at = ?
       WHERE id = ? AND status = 'running' AND provider_task_id IS NULL`,
    )
    .bind(code, now, id)
    .run();
  return changesOf(result) === 1;
}

/** Upload failed before a task existed. Safe to try again. */
export async function revertQueuedJob(db, jobId) {
  const id = cleanId(jobId);
  if (!id) return false;
  await ensureSchema(db);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE jobs
       SET status = 'queued',
           error_code = NULL,
           note_en = ?,
           note_zh = ?,
           updated_at = ?
       WHERE id = ? AND status = 'running' AND provider_task_id IS NULL`,
    )
    .bind(QUEUED_NOTE_EN, QUEUED_NOTE_ZH, now, id)
    .run();
  return changesOf(result) === 1;
}

export function templateCreditCost(template) {
  const seconds = template && template.durationSeconds;
  const cost = creditsForDuration(seconds);
  if (!Number.isInteger(cost) || cost < 1 || cost > 120) return 0;
  return cost;
}

/** Deduct the look's credit cost once. The ledger id is fixed to the job id. */
export async function chargeJobCredits(db, user, jobId, template) {
  const id = cleanId(jobId);
  if (!id) throw fail('bad_job');
  const cost = templateCreditCost(template);
  if (!cost) throw fail('bad_template');
  const ledgerId = `deduct_${id}`;
  try {
    return await appendLedger(db, user, {
      id: ledgerId,
      delta: -cost,
      kind: 'deduction',
      label_en: `Clip · ${template.name}`,
      label_zh: `短片 · ${template.nameZh}`,
      job_id: id,
    });
  } catch (err) {
    if (!err || err.code !== 'insufficient_credits') throw err;
    const row = assertUser(user);
    const account = await db.prepare(`SELECT balance FROM credit_accounts WHERE user_id = ?`).bind(row.user_id).first();
    const wrapped = fail('insufficient_credits');
    wrapped.needed = cost;
    wrapped.balance = Number(account && account.balance != null ? account.balance : 0);
    throw wrapped;
  }
}

/** Return a deduction once. Safe when the job was never charged. */
export async function refundChargeById(db, jobId) {
  const id = cleanId(jobId);
  if (!id) return null;
  await ensureSchema(db);
  const refundId = `refund_${id}`;
  const existing = await db.prepare(`SELECT id FROM credit_ledger WHERE id = ?`).bind(refundId).first();
  if (existing) return { id: refundId, already: true };
  const deduction = await db
    .prepare(`SELECT user_id, delta FROM credit_ledger WHERE id = ? AND kind = 'deduction'`)
    .bind(`deduct_${id}`)
    .first();
  if (!deduction) return null;
  const amount = -Number(deduction.delta);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  const person = await db
    .prepare(`SELECT user_id, email, name FROM users WHERE user_id = ?`)
    .bind(deduction.user_id)
    .first();
  if (!person) return null;
  return appendLedger(db, person, {
    id: refundId,
    delta: amount,
    kind: 'refund',
    label_en: 'Returned credits for a clip that did not finish',
    label_zh: '短片未完成，积分已退回',
    job_id: id,
  });
}

/** Failed jobs that were charged and never refunded. The drain calls this. */
export async function refundOutstandingFailures(db, limit = 20) {
  await ensureSchema(db);
  const listed = await db
    .prepare(
      `SELECT j.id AS id
       FROM jobs j
       JOIN credit_ledger d ON d.id = ('deduct_' || j.id) AND d.kind = 'deduction'
       LEFT JOIN credit_ledger r ON r.id = ('refund_' || j.id)
       WHERE j.status = 'failed' AND r.id IS NULL
       LIMIT ?`,
    )
    .bind(clampLimit(limit, 20))
    .all();
  let count = 0;
  for (const row of listed.results || []) {
    await refundChargeById(db, row.id);
    count += 1;
  }
  return count;
}

/**
 * Mark a queued or running job failed. result_url stays empty.
 * A charged job is refunded once, including when this is called again.
 */
export async function markJobFailed(db, jobId, fields = {}) {
  const id = cleanId(jobId);
  if (!id) throw fail('not_found');
  await ensureSchema(db);
  const errorCode = oneLine(fields.error_code || fields.errorCode, 80) || 'failed';
  const noteEn = oneLine(fields.note_en || fields.noteEn, 400) || 'Video generation failed. Please try again from Create.';
  const noteZh = oneLine(fields.note_zh || fields.noteZh, 400) || '视频生成失败。请在创作页再试一次。';
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE jobs
       SET status = 'failed',
           result_url = NULL,
           error_code = ?,
           note_en = ?,
           note_zh = ?,
           updated_at = ?
       WHERE id = ? AND status IN ('queued', 'running')`,
    )
    .bind(errorCode, noteEn, noteZh, now, id)
    .run();
  const saved = await db.prepare(`SELECT status FROM jobs WHERE id = ?`).bind(id).first();
  if (saved && saved.status === 'failed') await refundChargeById(db, id);
  return changesOf(result) === 1;
}

/**
 * Queue a job for a signed-in user. Does not call a video provider and does
 * not set status ready. Optional upload keys record a photo already stored
 * in R2. result_url stays empty until attachJobResult.
 * Create starts Bailian with waitUntil. Ops can still POST /api/jobs/process.
 */
export async function createStubJob(db, user, templateSlug, options = {}) {
  const template = getTemplate(templateSlug);
  if (!template) throw fail('bad_template');
  const row = await ensureUser(db, user);
  const id = options.id ? cleanId(options.id) : newId('job');
  if (!id || !id.startsWith('job_')) throw fail('storage_error');
  const uploadKey = cleanMediaKey(options.upload_key, 'uploads/');
  const uploadKey2 = cleanMediaKey(options.upload_key_2, 'uploads/');
  const uploadUrl = cleanMediaUrl(options.upload_url, id, 'photo');
  const uploadUrl2 = cleanMediaUrl(options.upload_url_2, id, 'photo-2');
  if (uploadKey && !uploadKey.startsWith(`uploads/${row.user_id}/${id}/`)) throw fail('storage_error');
  if (uploadKey2 && !uploadKey2.startsWith(`uploads/${row.user_id}/${id}/`)) throw fail('storage_error');
  if (Boolean(uploadKey) !== Boolean(uploadUrl)) throw fail('storage_error');
  if (Boolean(uploadKey2) !== Boolean(uploadUrl2)) throw fail('storage_error');
  const now = new Date().toISOString();
  const status = 'queued';
  await db
    .prepare(
      `INSERT INTO jobs (
         id, user_id, template_slug, template_name, template_name_zh,
         status, result_url, upload_key, upload_key_2, upload_url, upload_url_2, result_key,
         error_code, note_en, note_zh, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      row.user_id,
      template.slug,
      template.name,
      template.nameZh,
      status,
      uploadKey,
      uploadKey2,
      uploadUrl,
      uploadUrl2,
      STUB_NOTE_EN,
      STUB_NOTE_ZH,
      now,
      now,
    )
    .run();
  const saved = await db
    .prepare(`SELECT ${JOB_COLUMNS} FROM jobs WHERE id = ? AND user_id = ?`)
    .bind(id, row.user_id)
    .first();
  if (!saved) throw fail('storage_error');
  const job = mapJob(saved);
  if (job.status !== 'queued' || job.result_url) throw fail('storage_error');
  return job;
}

/**
 * Mark a job ready with an MP4 that is already in R2.
 * Does not call a video provider. result_url must be this app's download URL.
 */
export async function attachJobResult(db, jobId, result) {
  const id = cleanId(jobId);
  if (!id) throw fail('not_found');
  await ensureSchema(db);
  const existing = await db.prepare(`SELECT id, user_id, status FROM jobs WHERE id = ?`).bind(id).first();
  if (!existing) throw fail('not_found');
  if (existing.status === 'failed') throw fail('bad_status');
  const resultKey = cleanMediaKey(result && result.result_key, 'results/');
  const resultUrl = cleanMediaUrl(result && result.result_url, id, 'result');
  if (!resultKey || !resultUrl) throw fail('bad_video');
  if (resultKey !== `results/${existing.user_id}/${id}.mp4`) throw fail('storage_error');
  const noteEn = oneLine(result.note_en, 400) || 'Your clip is ready to download.';
  const noteZh = oneLine(result.note_zh, 400) || '成片可以下载了。';
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE jobs
       SET status = 'ready',
           result_key = ?,
           result_url = ?,
           error_code = NULL,
           note_en = ?,
           note_zh = ?,
           updated_at = ?
       WHERE id = ? AND status IN ('queued', 'running', 'ready')`,
    )
    .bind(resultKey, resultUrl, noteEn, noteZh, now, id)
    .run();
  const saved = await db
    .prepare(
      `SELECT ${JOB_COLUMNS}, result_key, upload_key, upload_key_2, user_id
       FROM jobs WHERE id = ?`,
    )
    .bind(id)
    .first();
  if (!saved || saved.status !== 'ready' || saved.result_key !== resultKey) throw fail('storage_error');
  return { job: mapJob(saved), record: saved };
}
