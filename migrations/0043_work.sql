-- What became of the work after you decided it (work.ts): an agent reports a ticket done (its MR, merged or not, a
-- line on the result) or dropped, and a reviewed MR merged or closed. And the evening summary's settings.
ALTER TABLE tickets ADD COLUMN outcome TEXT NOT NULL DEFAULT '';
ALTER TABLE tickets ADD COLUMN outcome_at INTEGER;
ALTER TABLE tickets ADD COLUMN outcome_note TEXT NOT NULL DEFAULT '';
ALTER TABLE tickets ADD COLUMN outcome_mr TEXT NOT NULL DEFAULT '';
ALTER TABLE tickets ADD COLUMN merged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN closed TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN closed_at INTEGER;
CREATE TABLE work_settings (
  member        TEXT PRIMARY KEY,
  tz            TEXT NOT NULL DEFAULT 'UTC',
  summary_on    INTEGER NOT NULL DEFAULT 0,
  summary_hour  INTEGER NOT NULL DEFAULT 18
);
