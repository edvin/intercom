-- Handoffs in parts: the receiver's obligations as a checklist it ticks off when it records the outcome
-- ([{text, state: open|done|na|waived, note, by, at}]), and the gates as a list with a result each
-- ([{name, result: passed|failed|not run, detail}]). Older handoffs keep their gates as text.
ALTER TABLE handoffs ADD COLUMN obligations TEXT NOT NULL DEFAULT '[]';
ALTER TABLE handoffs ADD COLUMN gate_list TEXT NOT NULL DEFAULT '[]';
