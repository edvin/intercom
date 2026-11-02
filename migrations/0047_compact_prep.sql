-- A compaction that warns first (upkeep.ts): the agent is asked to save its state and say what the summary must keep;
-- when that turn ends it's compacted with that. {id, msg, at, instructions, keep?}
ALTER TABLE sessions ADD COLUMN compact_prep TEXT;
