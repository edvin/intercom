-- What the session's intercom-ui mod reads off Claude Code: the plan's rate-limit windows (5-hour, weekly) and the
-- session's cost, as JSON {rl: [{k, p, r}], usd}. Shown in the agent's info panel; written only when it changes.
ALTER TABLE sessions ADD COLUMN usage TEXT;
