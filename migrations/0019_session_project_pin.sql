-- A project set for a session from the dashboard, overriding the one its repo maps to ('' = follow the repo),
-- and the repo the session reported, so the dashboard can link it to a project.
ALTER TABLE sessions ADD COLUMN project_pin TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN repo TEXT NOT NULL DEFAULT '';
