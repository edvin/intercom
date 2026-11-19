-- When the daily check last reminded someone about a pending handoff (records.ts handoffCheck): once per handoff.
ALTER TABLE handoffs ADD COLUMN pinged_at INTEGER;
