-- Reverses 202610191900_iam_privileged_reviews.up.sql. Drops only what this migration created.
ALTER TABLE iam_user_role_assignments DROP COLUMN IF EXISTS revoked_at;
DROP TABLE IF EXISTS iam_shadow_comparisons;
DROP TABLE IF EXISTS iam_export_events;
DROP TABLE IF EXISTS iam_export_rules;
DROP TABLE IF EXISTS iam_access_review_items;
DROP TABLE IF EXISTS iam_access_reviews;
DROP TABLE IF EXISTS iam_revocations;
DROP TABLE IF EXISTS iam_elevations;
