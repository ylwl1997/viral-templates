-- Pet looks can store more than two photos. Safe to re-run: duplicate columns are ignored by ensureMediaColumns.
-- SQLite migrations here are applied once. ADD COLUMN is a no-op if you rebuild from SCHEMA_SQL.

ALTER TABLE jobs ADD COLUMN extra_upload_keys TEXT;
ALTER TABLE jobs ADD COLUMN pipeline_frame TEXT;
