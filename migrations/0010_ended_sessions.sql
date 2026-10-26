-- Where a named session stopped reading when it ended, so the next session with that name picks up its mail.
CREATE TABLE ended_sessions (
  member      TEXT NOT NULL,
  label       TEXT NOT NULL,
  cursor      INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL,
  PRIMARY KEY (member, label)
);
