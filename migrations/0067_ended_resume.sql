-- An agent that ended keeps what it takes to bring it back (its session, client, machine, folder, command line and
-- pane): one row per name, the newest end, so the dashboard can list and resume them without searching anything.
ALTER TABLE ended_sessions ADD COLUMN session_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ended_sessions ADD COLUMN client TEXT NOT NULL DEFAULT 'claude';
ALTER TABLE ended_sessions ADD COLUMN host TEXT NOT NULL DEFAULT '';
ALTER TABLE ended_sessions ADD COLUMN cwd TEXT NOT NULL DEFAULT '';
ALTER TABLE ended_sessions ADD COLUMN launch TEXT NOT NULL DEFAULT '';
ALTER TABLE ended_sessions ADD COLUMN pane TEXT NOT NULL DEFAULT '';
ALTER TABLE ended_sessions ADD COLUMN project TEXT NOT NULL DEFAULT '';
