-- Waking an agent that isn't reading by itself (stuck.ts): once per oldest waiting message, and only if that didn't
-- work does the card in Waiting for you show. On unless you turn it off.
ALTER TABLE stuck_marks ADD COLUMN nudged_oldest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stuck_marks ADD COLUMN nudged_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE upkeep ADD COLUMN nudge INTEGER NOT NULL DEFAULT 1;
