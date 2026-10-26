-- Side questions (/btw) to your own agent from the dashboard: answered by a fork of its context, never added to
-- it. Kept apart from messages so nothing here reaches the agent's inbox or hooks.
CREATE TABLE btw (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member       TEXT NOT NULL,
  session_id   TEXT NOT NULL,
  thread       INTEGER NOT NULL DEFAULT 0, -- the id of the thread's first question
  question     TEXT NOT NULL,
  answer       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | answered | failed
  reason       TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  answered_at  INTEGER
);
CREATE INDEX btw_session ON btw (member, session_id, id);
