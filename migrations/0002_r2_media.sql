-- Private R2 keys for photos and finished clips.
-- 0001_account.sql is already applied on the remote database and is not edited.
-- Pages Functions also add these columns on first use (ensureMediaColumns).
-- If this migration reports "duplicate column name", the running app already added them.

ALTER TABLE jobs ADD COLUMN upload_key TEXT;
ALTER TABLE jobs ADD COLUMN upload_key_2 TEXT;
ALTER TABLE jobs ADD COLUMN upload_url TEXT;
ALTER TABLE jobs ADD COLUMN upload_url_2 TEXT;
ALTER TABLE jobs ADD COLUMN result_key TEXT;
