-- A DM to one agent by its name reaches that agent only, also when a project has the same name (lib.ts postMessage).
ALTER TABLE messages ADD COLUMN agent_only INTEGER NOT NULL DEFAULT 0;
