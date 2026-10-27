import { SCHEMA_SQL, schemaStatements } from './schema.js';
import { getTemplate } from './templates.js';

const JOB_STATUSES = new Set(['queued', 'running', 'ready', 'failed']);
const LEDGER_KINDS = new Set(['topup', 'deduction', 'refund']);

const STUB_NOTE_EN =
  'Queued. Video generation is not available yet, so this job stays queued and has no file to download.';
const STUB_NOTE_ZH = '已排队。视频生成尚未开放，因此会保持排队，没有可下载的文件。';

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

export async function ensureSchema(db) {
  if (schemaReady) return;
  for (const sql of schemaStatements(SCHEMA_SQL)) {
    await db.prepare(sql).run();
  }
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

export function mapJob(row) {
  const status = JOB_STATUSES.has(row.status) ? row.status : 'failed';
  return {
    id: String(row.id),
    template_slug: String(row.template_slug || ''),
    template_name: String(row.template_name || ''),
    template_name_zh: String(row.template_name_zh || ''),
    status,
    result_url: publicResultUrl(status, row.result_url),
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
          `SELECT ${JOB_COLUMNS} FROM jobs
           WHERE user_id = ? AND status = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .bind(row.user_id, status, limit)
        .all()
    : await db
        .prepare(
          `SELECT ${JOB_COLUMNS} FROM jobs
           WHERE user_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .bind(row.user_id, limit)
        .all();
  const jobs = (listed.results || []).map(mapJob);
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
 * No request path calls this until payments or a real generate charge exist.
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

/**
 * Queue a job for a signed-in user. Does not call a video provider,
 * does not set status ready, and does not store a media URL.
 */
export async function createStubJob(db, user, templateSlug) {
  const template = getTemplate(templateSlug);
  if (!template) throw fail('bad_template');
  const row = await ensureUser(db, user);
  const id = newId('job');
  const now = new Date().toISOString();
  const status = 'queued';
  await db
    .prepare(
      `INSERT INTO jobs (
         id, user_id, template_slug, template_name, template_name_zh,
         status, result_url, error_code, note_en, note_zh, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
    )
    .bind(id, row.user_id, template.slug, template.name, template.nameZh, status, STUB_NOTE_EN, STUB_NOTE_ZH, now, now)
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
