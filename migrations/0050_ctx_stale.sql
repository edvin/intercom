-- After a compaction, the context figure the mod reads stays at the old value until the agent's next reply:
-- ctx_stale holds that old percentage, and reports at or above it are ignored (for up to 2 hours).
ALTER TABLE sessions ADD COLUMN ctx_stale INTEGER;
-- Why the last compaction asked for from the dashboard didn't run (the mod's answer), shown on the context card.
ALTER TABLE sessions ADD COLUMN compact_err TEXT;
