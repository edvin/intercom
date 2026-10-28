-- How full a Claude Code session's context window is (reported by the intercom-ui mod as it polls), and a
-- compaction its user asked for from the dashboard, which the mod runs once the session is idle.
ALTER TABLE sessions ADD COLUMN ctx_pct INTEGER;
ALTER TABLE sessions ADD COLUMN ctx_tokens INTEGER;
ALTER TABLE sessions ADD COLUMN ctx_window INTEGER;
ALTER TABLE sessions ADD COLUMN ctx_at INTEGER;
ALTER TABLE sessions ADD COLUMN compact_req TEXT;
