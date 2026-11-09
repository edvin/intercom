-- Codex usage-limit resets (resets.ts): redeem one by itself when Codex agents run out, and when one was last tried
-- on each machine ({host: {at, outcome}}), so a machine doesn't spend a second reset right after the first.
ALTER TABLE upkeep ADD COLUMN resets INTEGER NOT NULL DEFAULT 0;
ALTER TABLE upkeep ADD COLUMN reset_log TEXT NOT NULL DEFAULT '{}';
