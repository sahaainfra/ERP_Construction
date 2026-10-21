-- Reverses 202610193100_wf_rules. Drops only what that migration added.
DROP TABLE IF EXISTS rul_decision_tables;
DROP INDEX IF EXISTS wf_instances_split;
ALTER TABLE wf_instances DROP COLUMN IF EXISTS split_key;
ALTER TABLE wf_instances DROP COLUMN IF EXISTS context_json;
