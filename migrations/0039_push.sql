-- Web push: each browser (a phone's home-screen app, a desktop browser) that turned notifications on, the hub's own
-- VAPID key pair, and the notifications due to go out (an approval waits a minute first, in case it's answered).
CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  member TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_ok INTEGER
);
CREATE INDEX push_subs_member ON push_subs (member);
CREATE TABLE push_keys (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  public_key TEXT NOT NULL,
  private_jwk TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE push_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member TEXT NOT NULL,
  ref TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  extra TEXT NOT NULL DEFAULT ''
);
CREATE INDEX push_queue_due ON push_queue (due_at);
