-- Whether a session's screen can be seen and typed into (screen.ts): '' no (not in tmux, or turned off on its
-- machine), 'view' seen only, 'keys' seen and typed into. Its local server says so when it connects.
ALTER TABLE sessions ADD COLUMN screen TEXT NOT NULL DEFAULT '';
