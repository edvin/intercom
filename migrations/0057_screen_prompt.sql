-- A question an agent shows in its terminal with no card of its own (prompts.ts), as last read from its screen: JSON
-- with the question, its options and when it was read.
ALTER TABLE sessions ADD COLUMN prompt TEXT;
