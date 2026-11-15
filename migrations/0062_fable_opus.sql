-- Agents on Fable switch to Opus when Fable's weekly limit runs out (fable.ts): on unless you turn it off.
ALTER TABLE upkeep ADD COLUMN fable_opus INTEGER NOT NULL DEFAULT 1;
