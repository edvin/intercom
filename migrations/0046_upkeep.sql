-- Keeping agents running and current (upkeep.ts): each session's tmux pane and how it was started (to restart it in
-- place, resumed by its id), and per person whether idle agents update by themselves, and the cards they put away.
ALTER TABLE sessions ADD COLUMN pane TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN launch TEXT NOT NULL DEFAULT '';
CREATE TABLE upkeep (
  member     TEXT PRIMARY KEY,
  auto       INTEGER NOT NULL DEFAULT 0,
  dismissed  TEXT NOT NULL DEFAULT '{}'
);
