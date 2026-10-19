-- Team members. Only the SHA-256 of each token is stored.
CREATE TABLE members (
  name        TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);

-- Channel posts (recipient NULL) and direct messages (recipient set).
-- kind: 'message' (written by a person/agent) or 'event' (lock/proposal activity).
CREATE TABLE messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel     TEXT NOT NULL,
  sender      TEXT NOT NULL,
  recipient   TEXT,
  kind        TEXT NOT NULL DEFAULT 'message',
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX messages_channel ON messages (channel, id);
CREATE INDEX messages_recipient ON messages (recipient, id);

-- Per-member read position over the messages table.
CREATE TABLE cursors (
  member        TEXT PRIMARY KEY,
  last_read_id  INTEGER NOT NULL DEFAULT 0
);

-- Advisory locks, e.g. "deploy:billing:prod". Expired rows are ignored and overwritten.
CREATE TABLE locks (
  resource    TEXT PRIMARY KEY,
  holder      TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  channel     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE proposals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel     TEXT NOT NULL,
  author      TEXT NOT NULL,
  question    TEXT NOT NULL,
  options     TEXT NOT NULL,            -- JSON array of strings
  status      TEXT NOT NULL DEFAULT 'open',
  outcome     TEXT,
  created_at  INTEGER NOT NULL,
  closes_at   INTEGER
);

CREATE TABLE votes (
  proposal_id INTEGER NOT NULL,
  member      TEXT NOT NULL,
  choice      TEXT NOT NULL,
  comment     TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (proposal_id, member)
);

-- What each member's Claude is currently working on.
CREATE TABLE presence (
  member      TEXT PRIMARY KEY,
  project     TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  updated_at  INTEGER NOT NULL
);
