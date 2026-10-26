-- Nicknames a member gives their machines in the dashboard ("edvins-mbp" → "work mac").
CREATE TABLE host_names (
  member  TEXT NOT NULL,
  host    TEXT NOT NULL,
  name    TEXT NOT NULL,
  PRIMARY KEY (member, host)
);
