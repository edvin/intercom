-- A forward set from the dashboard ("send what comes for it to this agent from now on"), next to renames.
ALTER TABLE agent_renames ADD COLUMN kind TEXT NOT NULL DEFAULT 'rename';
