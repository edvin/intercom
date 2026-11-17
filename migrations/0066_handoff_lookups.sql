-- Handoffs by who they're for (an agent's pending ones, stuck.ts) and decisions by the handoff they came from (the
-- Handoffs page shows each outcome's decision).
CREATE INDEX handoffs_to ON handoffs (to_member, to_agent, status);
CREATE INDEX decisions_handoff ON decisions (handoff_id);
