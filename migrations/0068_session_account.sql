-- The Anthropic account a Claude Code session runs on (its `claude auth status`: email, organization, plan), shown to its owner.
ALTER TABLE sessions ADD COLUMN account TEXT NOT NULL DEFAULT '';
