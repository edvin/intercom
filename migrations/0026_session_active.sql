-- When a session last did something (a prompt, a finished turn, a question for its user, a mirrored step, a post),
-- unlike last_seen, which every heartbeat moves. The dashboard tree shows and orders by it.
ALTER TABLE sessions ADD COLUMN active_at INTEGER;
UPDATE sessions SET active_at = state_at;
