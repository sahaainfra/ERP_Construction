-- Reverses 202610191230_dbf_sys_operations.up.sql. Drops only the tables and functions that migration created.
DROP FUNCTION IF EXISTS sys.is_effective(timestamptz, timestamptz, timestamptz);
DROP TABLE IF EXISTS sys.legacy_loads;
DROP TABLE IF EXISTS sys.acp_diffs;
DROP TABLE IF EXISTS sys.acp_runs;
DROP TABLE IF EXISTS sys.integrity_findings;
DROP TABLE IF EXISTS sys.integrity_snapshots;
DROP TABLE IF EXISTS sys.integrity_invariants;
DROP TABLE IF EXISTS sys.backfill_batches;
DROP TABLE IF EXISTS sys.outbox;
DROP TABLE IF EXISTS sys.idempotency_keys;
