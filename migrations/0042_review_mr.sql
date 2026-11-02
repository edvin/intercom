-- A review carries the MR itself (its description, author, branches, pipeline, files, commits and diff) so it can be
-- read without the forge, and the key of the ticket it implements, to show what was decided for that ticket.
ALTER TABLE reviews ADD COLUMN data TEXT NOT NULL DEFAULT '{}';
ALTER TABLE reviews ADD COLUMN ticket TEXT NOT NULL DEFAULT '';
