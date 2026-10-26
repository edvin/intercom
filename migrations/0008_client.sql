-- Which agent runs a session: 'claude' (Claude Code) or 'codex' (OpenAI Codex), as the local server reports it.
ALTER TABLE sessions ADD COLUMN client TEXT NOT NULL DEFAULT 'claude';
