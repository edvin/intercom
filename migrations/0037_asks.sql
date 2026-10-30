-- Questions an agent waits on in its terminal also come to the dashboard, whoever answers first: permission prompts,
-- AskUserQuestion questions (their options, to answer with a click) and plan approvals. Only away mode denies
-- unanswered ones; otherwise an unanswered one just closes and the terminal keeps asking.
ALTER TABLE approvals ADD COLUMN kind TEXT NOT NULL DEFAULT 'permission'; -- 'permission' | 'question' | 'plan'
ALTER TABLE approvals ADD COLUMN detail TEXT NOT NULL DEFAULT '';         -- questions (JSON) or the plan (markdown)
ALTER TABLE approvals ADD COLUMN answers TEXT;                            -- question -> answer (JSON), once answered
ALTER TABLE approvals ADD COLUMN away INTEGER NOT NULL DEFAULT 1;         -- asked in away mode: unanswered means denied
