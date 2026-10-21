-- Reverses 202610192200_auth_users.up.sql. Drops only what this migration created.
DROP TABLE IF EXISTS auth_password_history;
DROP TABLE IF EXISTS auth_users;
DROP TABLE IF EXISTS auth_id_series;
