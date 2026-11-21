-- An agent you paused from the dashboard (out of tokens, stopped for a while): whoever messages it is told, with why
-- and until when (pauses.ts). Gone when you resume it or its time is up.
CREATE TABLE agent_pauses (
  member TEXT NOT NULL,
  label TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  until INTEGER,
  tz TEXT NOT NULL DEFAULT 'UTC', -- yours, for saying until when
  at INTEGER NOT NULL,
  PRIMARY KEY (member, label)
);
