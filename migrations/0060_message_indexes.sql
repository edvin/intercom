-- What waits for an agent (stuck.ts) and what reached you lately (the tree, the inbox): by recipient and time, not
-- every message to a person since the start.
CREATE INDEX messages_to_agent ON messages (recipient, recipient_agent, created_at);
CREATE INDEX messages_to_when ON messages (recipient, created_at);
