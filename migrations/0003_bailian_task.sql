-- DashScope task id for wan2.2-animate-move.
-- 0001 and 0002 are already applied on databases that ran them. Do not edit those.
-- Pages Functions also add this column on first use (ensureMediaColumns).
-- If this migration reports "duplicate column name", the running app already added it.

ALTER TABLE jobs ADD COLUMN provider_task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_status_created
  ON jobs (status, created_at);
