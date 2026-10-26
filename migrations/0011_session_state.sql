-- What a session is doing, as its hooks report it: working, idle, or waiting (on a permission prompt or input).
ALTER TABLE sessions ADD COLUMN state TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN state_detail TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN state_at INTEGER;
