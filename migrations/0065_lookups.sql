-- Files from agents (gallery.ts) go from the attachments of the last 30 days to their messages, not from every
-- message to its attachments (80,000 rows a visit); the latest handoffs (dashboard) from the newest back.
CREATE INDEX attachments_when ON attachments (created_at);
CREATE INDEX handoffs_updated ON handoffs (updated_at);
