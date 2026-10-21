-- Reverses 202610191200_dbf_sys_foundation.up.sql. Removes only objects that migration created.
DROP FUNCTION IF EXISTS sys.mask_account(text);
DROP FUNCTION IF EXISTS sys.mask_email(text);
DROP FUNCTION IF EXISTS sys.mask_phone(text);
DROP FUNCTION IF EXISTS sys.mask_pan(text);
DROP FUNCTION IF EXISTS sys.hex_digits(text, integer);
DROP FUNCTION IF EXISTS sys.mask_salt();
DROP FUNCTION IF EXISTS sys.mask_bytes(text);
DROP FUNCTION IF EXISTS raise_mask_salt_missing();
DROP FUNCTION IF EXISTS sys.create_monthly_partitions(regclass, integer);
DROP FUNCTION IF EXISTS sys.enable_tenant_rls(regclass);
DROP FUNCTION IF EXISTS sys.current_user_id();
DROP FUNCTION IF EXISTS sys.current_tenant_id();
DROP FUNCTION IF EXISTS sys.enforce_append_only(regclass);
DROP FUNCTION IF EXISTS sys.reject_mutation();
DROP TABLE IF EXISTS sys.migration_runs;
DROP SCHEMA IF EXISTS sys;
