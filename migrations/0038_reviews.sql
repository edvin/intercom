-- Reviews waiting for their person's call (reviews.ts): an agent reviewing an MR sends only the findings it may not
-- act on alone; the dashboard shows them as a card, and the decision goes back to the agent as a YOUR USER message.
CREATE TABLE reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member      TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  project     TEXT,
  url         TEXT NOT NULL,             -- the MR or PR
  title       TEXT NOT NULL,
  verdict     TEXT NOT NULL,             -- the agent's one line
  recommend   TEXT NOT NULL,             -- approve | approve_after | request_changes | hold
  findings    TEXT NOT NULL,             -- JSON: [{ severity, summary, comment, post }]
  head        TEXT NOT NULL DEFAULT '',  -- the commit it reviewed
  status      TEXT NOT NULL DEFAULT 'open', -- open | decided | withdrawn | replaced
  decision    TEXT,                      -- JSON, once decided
  thread      TEXT NOT NULL DEFAULT '[]', -- JSON: [{ who: 'you' | agent label, finding (1-based, 0 = the whole review), text, at }]
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER
);
CREATE INDEX reviews_member ON reviews (member, status);
