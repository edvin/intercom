-- A project's decision log: calls that were made (mostly an integrator's, not votes), looked up before re-proposing work.
CREATE TABLE decisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project       TEXT NOT NULL,
  author        TEXT NOT NULL,
  author_agent  TEXT,
  subject       TEXT NOT NULL,
  verdict       TEXT NOT NULL,             -- approved | rejected | held | noted
  reason        TEXT NOT NULL DEFAULT '',
  refs          TEXT NOT NULL DEFAULT '',  -- commits, branches, paths: space separated, searchable
  handoff_id    INTEGER,
  superseded_by INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX decisions_project ON decisions (project, id);

-- Work handed from one agent to another (a commit, branch or worktree with its evidence and gates), and what became of it.
CREATE TABLE handoffs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project       TEXT NOT NULL,
  author        TEXT NOT NULL,
  author_agent  TEXT,
  to_member     TEXT,
  to_agent      TEXT,
  ref           TEXT NOT NULL,
  summary       TEXT NOT NULL,
  evidence      TEXT NOT NULL DEFAULT '',
  gates         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | integrated | held | rejected | withdrawn
  result        TEXT NOT NULL DEFAULT '',         -- e.g. the sha it was integrated as
  note          TEXT NOT NULL DEFAULT '',
  updated_by    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX handoffs_project ON handoffs (project, status, id);
