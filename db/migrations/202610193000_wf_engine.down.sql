-- Reverses 202610193000_wf_engine. Drops only the tables that migration created, in dependency order.
DROP TABLE IF EXISTS wf_action_log;
DROP TABLE IF EXISTS wf_tasks;
DROP TABLE IF EXISTS wf_instances;
DROP TABLE IF EXISTS wf_definitions;
