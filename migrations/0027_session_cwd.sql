-- The session's working directory (home shortened to ~), shown to its owner next to the branch.
ALTER TABLE sessions ADD COLUMN cwd TEXT NOT NULL DEFAULT '';
