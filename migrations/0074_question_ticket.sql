-- The ticket a question is about (questions.ts), so its page links from the ticket's and the MR's views.
ALTER TABLE questions ADD COLUMN ticket TEXT NOT NULL DEFAULT '';
