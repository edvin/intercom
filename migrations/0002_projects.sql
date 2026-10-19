-- Project registry: channel name = project name. `repos` maps git repo names to the project.
CREATE TABLE projects (
  name        TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  repos       TEXT NOT NULL DEFAULT '[]',   -- JSON array of repo names / aliases
  rules       TEXT NOT NULL DEFAULT '',     -- shown to every agent working in this project
  updated_by  TEXT,
  updated_at  INTEGER
);

-- Which channels each member's agents receive. mode 'mute' prevents auto-follow from re-adding it.
CREATE TABLE follows (
  member      TEXT NOT NULL,
  channel     TEXT NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'follow',
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (member, channel)
);
