-- Agents that don't take their messages (stuck.ts): per person and agent, the newest waiting message they dismissed
-- (the card comes back with a newer one) and the oldest one they were notified about (one notification per spell).
CREATE TABLE stuck_marks (
  member           TEXT NOT NULL,
  agent            TEXT NOT NULL,
  dismissed_upto   INTEGER NOT NULL DEFAULT 0,
  notified_oldest  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (member, agent)
);
