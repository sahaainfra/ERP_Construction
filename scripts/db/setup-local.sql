-- Local development setup (Part 03 REQ-DBF-F15). Run once as a PostgreSQL superuser:
--   psql -U postgres -h localhost \
--     -v migrator_password='choose-a-password' -v app_password='choose-another' \
--     -f scripts/db/setup-local.sql
-- Creates two roles and two databases. The migrator owns the schema; the application role has no DDL and no superuser.
-- Passwords are passed as variables and are never written to the repository.

SELECT format('CREATE ROLE erp_migrator LOGIN PASSWORD %L CREATEDB CREATEROLE', :'migrator_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_migrator') \gexec
SELECT format('ALTER ROLE erp_migrator PASSWORD %L', :'migrator_password')
 WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_migrator') \gexec

SELECT format('CREATE ROLE erp_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') \gexec
SELECT format('ALTER ROLE erp_app PASSWORD %L', :'app_password')
 WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') \gexec

SELECT 'CREATE DATABASE erp_dev OWNER erp_migrator'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'erp_dev') \gexec
SELECT 'CREATE DATABASE erp_test OWNER erp_migrator'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'erp_test') \gexec
