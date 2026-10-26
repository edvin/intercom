-- When a direct message entered an agent's context, and which session took it: the dashboard's delivery marks.
CREATE TABLE deliveries (
  message_id  INTEGER NOT NULL,
  member      TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  at          INTEGER NOT NULL,
  PRIMARY KEY (message_id, member, session_id)
);
-- Messages from before delivery tracking have no record; they get no mark rather than a wrong one.
INSERT OR REPLACE INTO settings (key, value) SELECT 'deliveries_since', COALESCE(MAX(id), 0) FROM messages;
