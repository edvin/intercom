-- Claude.ai (or another remote MCP client) as a connector: it registers itself (OAuth dynamic client registration)
-- and signs in through the dashboard; its tokens are kind 'connector' and work only on /connector. A message
-- sent through one says where it came from (via).
CREATE TABLE oauth_clients (
  client_id     TEXT PRIMARY KEY,
  secret_hash   TEXT,
  name          TEXT NOT NULL DEFAULT '',
  redirect_uris TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  used_at       INTEGER
);
ALTER TABLE messages ADD COLUMN via TEXT;
