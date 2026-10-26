-- The loops a session runs (/loop, scheduled prompts), as seen in its transcript by the local server: JSON list.
ALTER TABLE sessions ADD COLUMN loops TEXT NOT NULL DEFAULT '[]';
