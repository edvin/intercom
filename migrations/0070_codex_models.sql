-- A Codex agent's models, as its machine's Codex lists them (models_cache.json): offered when switching its model.
ALTER TABLE sessions ADD COLUMN codex_models TEXT;
