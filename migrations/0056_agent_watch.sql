-- "Tell me when it's done" (the bell in an agent's header): one row per agent you're waiting on; a push goes out and
-- the row goes when its turn ends.
CREATE TABLE agent_watch (
  member      TEXT NOT NULL,
  label       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (member, label)
);
