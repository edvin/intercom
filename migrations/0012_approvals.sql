-- Approval questions from agents while their person is away: answered in the dashboard, polled by the hook.
CREATE TABLE approvals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member      TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  client      TEXT NOT NULL DEFAULT 'claude',
  tool        TEXT NOT NULL,
  summary     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  decision    TEXT,              -- 'allow' | 'deny' | 'expired'
  note        TEXT NOT NULL DEFAULT '',
  decided_at  INTEGER
);
CREATE INDEX approvals_member ON approvals (member, decision);
