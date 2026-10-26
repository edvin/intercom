-- When the intercom-ui mod in a session last polled, and its version: side questions (btw) need it.
ALTER TABLE sessions ADD COLUMN ui_at INTEGER;
ALTER TABLE sessions ADD COLUMN ui_version TEXT NOT NULL DEFAULT '';
