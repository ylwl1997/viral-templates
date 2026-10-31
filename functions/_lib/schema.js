/**
 * Fresh-install schema. migrations/0001_account.sql is the applied baseline
 * (no media columns). migrations/0002_r2_media.sql adds the same columns on
 * databases that already ran 0001. ensureMediaColumns() does that alter too.
 * Checked by scripts/account-d1.test.mjs and scripts/r2-media.test.mjs.
 */
export const JOB_MEDIA_COLUMNS = ['upload_key', 'upload_key_2', 'upload_url', 'upload_url_2', 'result_key'];
export const SCHEMA_SQL = `
-- Shared account storage for the apex and every brand host.
-- Keyed by the auth session user id. One database, not one per site.

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id)
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('topup', 'deduction', 'refund')),
  label_en TEXT NOT NULL,
  label_zh TEXT NOT NULL,
  job_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON credit_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_slug TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_name_zh TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  result_url TEXT,
  upload_key TEXT,
  upload_key_2 TEXT,
  upload_url TEXT,
  upload_url_2 TEXT,
  result_key TEXT,
  error_code TEXT,
  note_en TEXT NOT NULL DEFAULT '',
  note_zh TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (result_url IS NULL OR status = 'ready'),
  FOREIGN KEY (user_id) REFERENCES users (user_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_created
  ON jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status
  ON jobs (user_id, status, created_at DESC);
`.trim();

/** Split schema into single statements. Statements must not contain semicolons. */
export function schemaStatements(sql = SCHEMA_SQL) {
  return sql
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.split('\n').some((line) => line.trim() && !line.trim().startsWith('--')));
}
