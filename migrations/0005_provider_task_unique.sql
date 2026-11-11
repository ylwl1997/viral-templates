-- One DashScope task id on one job.
-- SQLite UNIQUE allows many NULLs, so jobs that have not submitted stay valid.
-- Does not update or delete existing rows. Apply only after duplicate task ids are gone.
-- Pages Functions also create this index on first use (ensureSchema).

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_provider_task_id
  ON jobs (provider_task_id);
