-- The names (and roles) a member gave their agents per project: a crew per project and agent type
-- ("Codex in billing: alder the reviewer, birch the implementer"). New sessions there take a free one.
CREATE TABLE agent_names (
  member      TEXT NOT NULL,
  project     TEXT NOT NULL,
  client      TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT '',
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (member, project, client, name)
);
