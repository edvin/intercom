-- The tickets and MRs a question mentions (questions.ts): [{key, url, title, status, about}], shown with it and linked in its text.
ALTER TABLE questions ADD COLUMN refs TEXT NOT NULL DEFAULT '[]';
