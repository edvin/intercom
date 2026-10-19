-- Projects become private spaces with explicit members. Everything (messages, locks, votes, presence)
-- is visible only to a project's members; DMs only between people who share a project.

ALTER TABLE members ADD COLUMN org TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

CREATE TABLE project_members (
  project     TEXT NOT NULL,
  member      TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',   -- 'owner' | 'member'
  added_by    TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (project, member)
);
CREATE INDEX project_members_member ON project_members (member);

-- Invite links: /join/<code>. New people pick a handle and get an account; existing ones just join.
CREATE TABLE invites (
  code        TEXT PRIMARY KEY,
  project     TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  uses_left   INTEGER NOT NULL DEFAULT 1
);

-- People a member doesn't want to hear from (lock activity still comes through).
CREATE TABLE mutes (
  member      TEXT NOT NULL,
  muted       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (member, muted)
);

-- Existing data: every channel in use becomes a project, its followers become members,
-- and the first account becomes instance admin and owner of every project.
INSERT OR IGNORE INTO projects (name)
  SELECT channel FROM follows WHERE mode = 'follow'
  UNION SELECT channel FROM messages WHERE recipient IS NULL;
DELETE FROM projects WHERE name = 'general';
INSERT OR IGNORE INTO project_members (project, member, role, created_at)
  SELECT channel, member, 'member', created_at FROM follows WHERE mode = 'follow' AND channel != 'general';
UPDATE members SET is_admin = 1 WHERE name = (SELECT name FROM members ORDER BY created_at LIMIT 1);
INSERT OR REPLACE INTO project_members (project, member, role, created_at)
  SELECT p.name, m.name, 'owner', 0 FROM projects p, members m WHERE m.is_admin = 1;
-- follows now only records per-project mutes; membership replaces "follow".
DELETE FROM follows WHERE mode = 'follow';
