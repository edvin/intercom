-- Messages by who sent them: an agent's chat (agents.ts) finds what it sent through this instead of reading the whole
-- table backwards until it had 150 (15,000 rows on every redraw of a quiet agent's chat).
CREATE INDEX messages_from ON messages (sender, sender_agent, id);
