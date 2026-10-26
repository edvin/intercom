-- The intercom plugin version a session runs, so outdated ones can be flagged.
ALTER TABLE sessions ADD COLUMN version TEXT NOT NULL DEFAULT '';
