-- Handover notes per agent name in a project (notes.ts): what the agent was on, what's next, what to watch out for.
-- Written by the agent (the notes tool) or its person (the dashboard); handed to the next session that takes the name.
CREATE TABLE agent_notes (
  member      TEXT NOT NULL,
  project     TEXT NOT NULL,
  name        TEXT NOT NULL,
  body        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (member, project, name)
);
