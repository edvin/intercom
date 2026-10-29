-- Agents that take work from their person's other agents (opt-in, per agent name), and the messages that did.
CREATE TABLE IF NOT EXISTS agent_prefs (
  member TEXT NOT NULL,
  label TEXT NOT NULL,
  takes_work INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (member, label)
);
ALTER TABLE messages ADD COLUMN delegated INTEGER NOT NULL DEFAULT 0;
