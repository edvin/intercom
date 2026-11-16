-- Whether a direct message has been taken into an agent's context (a row in deliveries): the queries that look for
-- ones nobody took (stuck.ts stuckSessions, lib.ts unread's missed DMs) read only those through a small partial index,
-- not every message to the person in the last week (tens of thousands of rows, on every dashboard redraw and poll).
ALTER TABLE messages ADD COLUMN taken INTEGER;
UPDATE messages SET taken = 1 WHERE id IN (SELECT message_id FROM deliveries);
CREATE INDEX messages_untaken ON messages (recipient, created_at) WHERE taken IS NULL AND recipient_agent IS NOT NULL AND kind != 'event';
CREATE TRIGGER deliveries_taken AFTER INSERT ON deliveries BEGIN
  UPDATE messages SET taken = 1 WHERE id = NEW.message_id AND taken IS NULL;
END;
