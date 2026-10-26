-- The machine a session runs on (short hostname or the INTERCOM_HOST_NAME nickname), unless the member opts out.
ALTER TABLE sessions ADD COLUMN host TEXT NOT NULL DEFAULT '';
