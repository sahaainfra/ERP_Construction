-- Reverses 202610191850_iam_authentication.up.sql. Drops only what this migration created.
DROP TABLE IF EXISTS iam_mfa_factors;
DROP TABLE IF EXISTS iam_sessions;
DROP TABLE IF EXISTS iam_devices;
DROP TABLE IF EXISTS iam_password_resets;
DROP TABLE IF EXISTS iam_credentials;
