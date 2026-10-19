-- Individual Claude Code sessions ("agents"). Address = <member>/<label>, label = <project>-<first 4 of session id>.
CREATE TABLE sessions (
  member      TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  project     TEXT NOT NULL DEFAULT '',
  cursor      INTEGER NOT NULL,
  started_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  PRIMARY KEY (member, session_id)
);
CREATE INDEX sessions_label ON sessions (member, label);

-- Optional agent part of sender / recipient addresses.
ALTER TABLE messages ADD COLUMN sender_agent TEXT;
ALTER TABLE messages ADD COLUMN recipient_agent TEXT;   -- NULL = all of recipient's sessions; else a label or project
