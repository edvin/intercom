-- Tickets waiting for their person's call (tickets.ts): an agent proposes how to handle a ticket (still valid? what's
-- wrong? the plan), with the ticket itself copied in so it reads without the tracker. Nothing starts until the person
-- decides: go, go with changes, park or decline.
CREATE TABLE tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member      TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  project     TEXT,
  key         TEXT NOT NULL,             -- the tracker's key, e.g. SHOP-123
  url         TEXT NOT NULL,             -- the ticket in the tracker
  title       TEXT NOT NULL,
  verdict     TEXT NOT NULL,             -- the agent's one line
  recommend   TEXT NOT NULL,             -- go | park | decline
  data        TEXT NOT NULL,             -- JSON: the ticket (fields, description, comments, links), plan, questions, MRs
  status      TEXT NOT NULL DEFAULT 'open', -- open | decided | withdrawn | replaced
  decision    TEXT,                      -- JSON, once decided
  thread      TEXT NOT NULL DEFAULT '[]', -- JSON: [{ who: 'you' | agent label, text, at }]
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER
);
CREATE INDEX tickets_member ON tickets (member, status);
