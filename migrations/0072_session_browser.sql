-- The browser slot an agent claimed with the browser tool (browsers.ts): {slot, purpose, at}, or NULL.
ALTER TABLE sessions ADD COLUMN browser TEXT;
