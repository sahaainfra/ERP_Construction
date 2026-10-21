-- Reverses 202610191700_iam_permissions.up.sql. Drops only what this migration created.
DROP TABLE IF EXISTS iam_field_policies;
DROP TABLE IF EXISTS iam_authority_limits;
DROP TABLE IF EXISTS iam_user_role_assignments;
DROP TABLE IF EXISTS iam_role_permissions;
DROP TABLE IF EXISTS iam_roles;
DROP TABLE IF EXISTS iam_permissions;
