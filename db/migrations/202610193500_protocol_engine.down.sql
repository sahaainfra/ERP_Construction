-- Reverses 202610193500_protocol_engine. Drops only the tables that migration created.
DROP TABLE IF EXISTS protocol_fingerprints;
DROP TABLE IF EXISTS protocol_evaluations;
DROP TABLE IF EXISTS protocol_control_points;
