-- The web address of a session's git origin (e.g. https://gitlab.example.com/group/repo), for linking MR/issue refs.
ALTER TABLE sessions ADD COLUMN origin TEXT NOT NULL DEFAULT '';
