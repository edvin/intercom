-- What each session is working on: its git branch (shared automatically unless INTERCOM_SHARE_BRANCH=0)
-- and a short status note the agent or user sets.
ALTER TABLE sessions ADD COLUMN branch TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN note_at INTEGER;
ALTER TABLE presence ADD COLUMN branch TEXT NOT NULL DEFAULT '';
