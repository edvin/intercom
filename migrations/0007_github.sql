-- Instance settings (GitHub app credentials, open registration).
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Extra tokens per member: browser sessions ('web') and devices approved from the browser ('cli').
-- members.token_hash stays the account's original token.
CREATE TABLE tokens (
  token_hash  TEXT PRIMARY KEY,
  member      TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'cli',
  label       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX tokens_member ON tokens (member);

ALTER TABLE members ADD COLUMN github_id INTEGER;
ALTER TABLE members ADD COLUMN github_login TEXT;
CREATE UNIQUE INDEX members_github ON members (github_id) WHERE github_id IS NOT NULL;

-- Browser-approved setup: the CLI polls with `code`, the user approves `user_code` in the browser.
CREATE TABLE device_codes (
  code        TEXT PRIMARY KEY,
  user_code   TEXT NOT NULL UNIQUE,
  member      TEXT,
  token       TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- Joining without an invite: by GitHub repo access, or by request (opt-in per project).
ALTER TABLE projects ADD COLUMN github_repos TEXT NOT NULL DEFAULT '[]';
ALTER TABLE projects ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 0;
CREATE TABLE join_requests (
  project     TEXT NOT NULL,
  member      TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (project, member)
);
-- Short-lived proof that a member has push access to a GitHub repo.
CREATE TABLE repo_access (
  member      TEXT NOT NULL,
  repo        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  PRIMARY KEY (member, repo)
);

CREATE TABLE oauth_states (
  state       TEXT PRIMARY KEY,
  purpose     TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '',
  member      TEXT,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  key           TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL
);
