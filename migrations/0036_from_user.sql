-- Whether a message was written by its person themself (the dashboard, signed in with GitHub, or Claude.ai), as
-- opposed to sent with an agent's token without a session. Only those reach agents as YOUR USER.
ALTER TABLE messages ADD COLUMN from_user INTEGER NOT NULL DEFAULT 0;
UPDATE messages SET from_user = 1 WHERE sender_agent IS NULL;
