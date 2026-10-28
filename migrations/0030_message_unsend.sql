-- A direct message you sent from the dashboard that no agent has taken yet can be held (while you edit it) or
-- cancelled. Neither reaches an agent; you still see them in your own chat.
ALTER TABLE messages ADD COLUMN held_at INTEGER;
ALTER TABLE messages ADD COLUMN cancelled_at INTEGER;
