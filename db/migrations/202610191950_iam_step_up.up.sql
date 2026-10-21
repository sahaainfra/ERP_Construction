-- Part 07: the time of the last successful second factor on a session. Step-up (for exports and other listed actions) is judged
-- from this time, so a caller cannot claim a step-up it did not make.
ALTER TABLE iam_sessions ADD COLUMN mfa_verified_at timestamptz;
