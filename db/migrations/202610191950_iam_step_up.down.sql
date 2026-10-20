-- Reverses 202610191950_iam_step_up.up.sql.
ALTER TABLE iam_sessions DROP COLUMN IF EXISTS mfa_verified_at;
