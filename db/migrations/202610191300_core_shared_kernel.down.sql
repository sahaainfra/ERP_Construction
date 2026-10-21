-- Reverses 202610191300_core_shared_kernel.up.sql. Drops only the tables this migration created.
DROP TABLE IF EXISTS core_sample_records;
DROP TABLE IF EXISTS core_financial_periods;
DROP TABLE IF EXISTS core_holidays;
DROP TABLE IF EXISTS core_jobs;
DROP TABLE IF EXISTS core_protocol_evaluations;
DROP TABLE IF EXISTS core_action_ledger;
DROP TABLE IF EXISTS core_audit_entries;
DROP TABLE IF EXISTS core_number_allocations;
DROP TABLE IF EXISTS core_number_series;
DROP TABLE IF EXISTS core_settings;
