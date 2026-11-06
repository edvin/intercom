-- An agent's earlier names: a message sent to an old name nobody holds now goes to the session that had it (and the
-- sender is told), and unread mail to the old name moves with the rename.
CREATE TABLE IF NOT EXISTS agent_renames (
  member TEXT NOT NULL,
  old_label TEXT NOT NULL,
  new_label TEXT NOT NULL,
  session_id TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_renames_old ON agent_renames (member, old_label, at);
