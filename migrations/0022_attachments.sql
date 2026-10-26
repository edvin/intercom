-- Images sent with messages. The bytes live in R2 (30-day lifecycle); this row says who may see them.
CREATE TABLE attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id  INTEGER,            -- set once the message is posted
  member      TEXT NOT NULL,      -- who uploaded it
  r2_key      TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX attachments_message ON attachments (message_id);
