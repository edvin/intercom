-- When a session last took work handed by another of its person's agents: for an hour its own messages to
-- siblings are information, not work, so a chain or loop of agents instructing each other stops after one hop.
ALTER TABLE sessions ADD COLUMN took_work_at INTEGER;
