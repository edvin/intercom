-- The newest dashboard message to a session that its reply covers: at the end of a turn, the agent's final message
-- becomes the reply to any newer ones.
ALTER TABLE sessions ADD COLUMN answered INTEGER NOT NULL DEFAULT 0;
