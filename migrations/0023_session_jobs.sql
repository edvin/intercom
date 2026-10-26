-- Background jobs a session has running (shell commands it sent to the background), from its transcript: JSON list.
ALTER TABLE sessions ADD COLUMN jobs TEXT NOT NULL DEFAULT '[]';
