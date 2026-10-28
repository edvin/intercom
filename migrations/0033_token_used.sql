-- When a connector token was last used, so one nobody uses any more lapses (prune).
ALTER TABLE tokens ADD COLUMN used_at INTEGER;
