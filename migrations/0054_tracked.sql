-- Tickets and MRs an agent tracks for its person (tracked.ts): it publishes their status with the track tool after
-- each look at the tracker and the forge, and the dashboard shows them (view=tracked), grouped by who they wait on.
-- One row per item on a board (an agent's project, by default); a change of state or stage is kept as an event.
CREATE TABLE tracked (
  id INTEGER PRIMARY KEY,
  member TEXT NOT NULL,
  board TEXT NOT NULL,
  agent TEXT NOT NULL DEFAULT '',          -- the agent that last published it
  kind TEXT NOT NULL DEFAULT 'item',       -- ticket | mr | item
  key TEXT NOT NULL,                       -- PAY-1234, shop!456
  url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  parent TEXT NOT NULL DEFAULT '',         -- an MR's ticket key
  state TEXT NOT NULL DEFAULT '',          -- as the tracker or forge says it: In Review, opened, merged
  stage TEXT NOT NULL DEFAULT 'waiting',   -- you | working | waiting | done
  waiting_on TEXT NOT NULL DEFAULT '',     -- who: a reviewer, CI, QA, an agent
  next TEXT NOT NULL DEFAULT '',           -- the next step
  owner TEXT NOT NULL DEFAULT '',          -- the agent doing the work (member/label or label)
  facts TEXT NOT NULL DEFAULT '{}',        -- pipeline, approvals, conflicts, threads, draft, assignee, priority, labels
  refs TEXT NOT NULL DEFAULT '',           -- T12 R4 H231: the cards and handoff about it
  created_at INTEGER NOT NULL,
  changed_at INTEGER NOT NULL,             -- its state or stage last changed
  seen_at INTEGER NOT NULL,                -- last published
  done_at INTEGER,
  UNIQUE (member, board, key)
);
CREATE INDEX tracked_member ON tracked (member, stage);

CREATE TABLE tracked_events (
  id INTEGER PRIMARY KEY,
  item INTEGER NOT NULL,
  at INTEGER NOT NULL,
  what TEXT NOT NULL
);
CREATE INDEX tracked_events_item ON tracked_events (item, at);

-- When each board was last published, and by whom (a board gone quiet is shown as such).
CREATE TABLE tracked_boards (
  member TEXT NOT NULL,
  board TEXT NOT NULL,
  agent TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (member, board)
);
