-- Messages everyone receives regardless of follows (lock activity).
ALTER TABLE messages ADD COLUMN broadcast INTEGER NOT NULL DEFAULT 0;
