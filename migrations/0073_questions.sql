-- Questions an agent asks you about its own work (questions.ts): up to five, each with options; your answers go back to it.
CREATE TABLE questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member      TEXT NOT NULL,
  label       TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  project     TEXT NOT NULL DEFAULT '',
  title       TEXT NOT NULL,
  url         TEXT NOT NULL DEFAULT '',
  items       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  answer      TEXT,
  created_at  INTEGER NOT NULL,
  answered_at INTEGER
);
CREATE INDEX questions_open ON questions (member, status);
