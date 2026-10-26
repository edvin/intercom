-- Which of the holder's sessions took a lock (its name), so a person's other agents don't take it for their own.
-- NULL: taken from the dashboard (the person themself), or before this was recorded.
ALTER TABLE locks ADD COLUMN holder_agent TEXT;
