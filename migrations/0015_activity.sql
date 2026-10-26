-- What an agent session is doing, mirrored from its transcript by the local server: commands, file edits, its text.
-- Only ever shown to the member who owns the session. The newest 300 per session are kept.
CREATE TABLE activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member      TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  at          INTEGER NOT NULL,
  kind        TEXT NOT NULL,     -- prompt | text | cmd | edit | read | tool
  text        TEXT NOT NULL
);
CREATE INDEX activity_session ON activity (member, session_id, id);
