-- Reverses 202610191800_iam_sod.up.sql. Drops only what this migration created.
DROP TABLE IF EXISTS iam_sod_findings;
DROP TABLE IF EXISTS iam_sod_exceptions;
DROP TABLE IF EXISTS iam_actor_links;
DROP TABLE IF EXISTS iam_action_log;
DROP TABLE IF EXISTS iam_sod_rules;
