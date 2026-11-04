-- An agent's subagents (Claude Code's Agent tool), as the logs Claude Code keeps beside the session's show them: the
-- local server follows them and reports each start, step and end (subagents.ts). The list on the session; the steps here.
ALTER TABLE sessions ADD COLUMN subagents TEXT;
CREATE TABLE subagent_steps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member      TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  at          INTEGER NOT NULL,
  kind        TEXT NOT NULL,     -- prompt | text | cmd | edit | read | tool
  text        TEXT NOT NULL
);
CREATE INDEX subagent_steps_agent ON subagent_steps (member, session_id, agent_id, id);
