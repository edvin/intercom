-- The model a session runs (as its intercom-ui mod reads it), a switch asked for from the dashboard (JSON: id and
-- model, run by the mod between turns, like /model <name>) and why the last one didn't take.
ALTER TABLE sessions ADD COLUMN model TEXT;
ALTER TABLE sessions ADD COLUMN model_req TEXT;
ALTER TABLE sessions ADD COLUMN model_err TEXT;
