-- Part 03 baseline. Module: dbf. Creates the technical `sys` schema used by the database framework.
-- Business tables are created by later Parts; this migration creates no business data.
-- Money and quantity columns use exact types only (AC-7). No pgcrypto: gen_random_uuid() and sha256() are built in.

CREATE SCHEMA IF NOT EXISTS sys;
COMMENT ON SCHEMA sys IS 'Technical schema for the database framework (Part 03). Technical Console only.';

-- Migration register (REQ-DBF-F02). One row per applied or rolled-back migration direction.
CREATE TABLE IF NOT EXISTS sys.migration_runs (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version         text        NOT NULL,
  module_code     text        NOT NULL CHECK (module_code ~ '^[a-z][a-z0-9]*$'),
  direction       text        NOT NULL CHECK (direction IN ('up', 'down')),
  checksum        text        NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  dry_run         boolean     NOT NULL DEFAULT false,
  status          text        NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'rolled_back_dry_run')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  duration_ms     integer,
  lock_wait_ms    integer,
  applied_by      text        NOT NULL DEFAULT current_user,
  error_summary   text,
  acp_reference   text,
  CONSTRAINT migration_runs_version_direction UNIQUE (version, direction, started_at)
);
COMMENT ON TABLE sys.migration_runs IS 'Migration history (REQ-DBF-F02). Rows are written by the migration runner; a row is never deleted.';

-- Append-only helpers. Used by the audit and history tables that later Parts add (AC-12).
CREATE OR REPLACE FUNCTION sys.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE OR REPLACE FUNCTION sys.enforce_append_only(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION sys.reject_mutation()',
                 'trg_append_only_' || md5(target::text), target);
END $$;
COMMENT ON FUNCTION sys.enforce_append_only(regclass) IS 'Blocks UPDATE and DELETE on a table for every role (defence in depth beyond grants).';

-- Tenant and user context set by the server for each transaction (REQ-DBF-F09, N11).
-- The context is read with current_setting(..., true): when it is not set, the function returns NULL and policies match no rows.
CREATE OR REPLACE FUNCTION sys.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION sys.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- Row-level security template (ADR-002). Forces the policy on the table owner too.
CREATE OR REPLACE FUNCTION sys.enable_tenant_rls(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (tenant_id = sys.current_tenant_id()) WITH CHECK (tenant_id = sys.current_tenant_id())', target);
END $$;
COMMENT ON FUNCTION sys.enable_tenant_rls(regclass) IS 'Applies the tenant isolation policy to a table with a tenant_id column (ADR-002).';

-- Monthly range partitions created ahead of time (REQ-DBF-F08). Partition names: <parent>_yyyymm.
CREATE OR REPLACE FUNCTION sys.create_monthly_partitions(parent regclass, months_ahead integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  start_month date := date_trunc('month', now())::date;
  m integer;
  from_ts date;
  to_ts date;
  part_name text;
  created integer := 0;
BEGIN
  IF months_ahead < 0 THEN RAISE EXCEPTION 'months_ahead must be >= 0'; END IF;
  FOR m IN 0..months_ahead LOOP
    from_ts := (start_month + make_interval(months => m))::date;
    to_ts := (start_month + make_interval(months => m + 1))::date;
    part_name := format('%s_%s', parent::text, to_char(from_ts, 'YYYYMM'));
    IF to_regclass(part_name) IS NULL THEN
      EXECUTE format('CREATE TABLE %s PARTITION OF %s FOR VALUES FROM (%L) TO (%L)', part_name, parent, from_ts, to_ts);
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END $$;
COMMENT ON FUNCTION sys.create_monthly_partitions(regclass, integer) IS 'Creates monthly partitions for the current and next N months (REQ-DBF-F08). Idempotent.';

-- Deterministic masking (REQ-DBF-F13). Output keeps each character class; the input cannot be recovered without the salt.
-- The salt comes from a per-environment setting. Masking refuses to run when it is unset.
CREATE OR REPLACE FUNCTION raise_mask_salt_missing() RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sys.mask_salt is not set; masking refuses to run without a per-environment salt';
END $$;

CREATE OR REPLACE FUNCTION sys.mask_salt() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('sys.mask_salt', true), ''), raise_mask_salt_missing())
$$;

CREATE OR REPLACE FUNCTION sys.mask_bytes(input text) RETURNS bytea
LANGUAGE sql STABLE AS $$
  SELECT sha256(convert_to(sys.mask_salt() || input, 'UTF8'))
$$;

CREATE OR REPLACE FUNCTION sys.hex_digits(input text, n integer) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT substr(encode(sys.mask_bytes(input), 'hex'), 1, n)
$$;

-- PAN: letters become letters A-Z, digits become digits 0-9, other characters are kept. Shape is preserved.
CREATE OR REPLACE FUNCTION sys.mask_pan(pan text) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  b bytea;
  out text := '';
  c text;
  val integer;
BEGIN
  IF pan IS NULL THEN RETURN NULL; END IF;
  b := sys.mask_bytes(pan);
  FOR i IN 1..length(pan) LOOP
    c := substr(pan, i, 1);
    val := get_byte(b, (i - 1) % 32);
    IF c ~ '[A-Z]' THEN out := out || chr(65 + val % 26);
    ELSIF c ~ '[0-9]' THEN out := out || (val % 10)::text;
    ELSE out := out || c;
    END IF;
  END LOOP;
  RETURN out;
END $$;

-- Phone: the first two characters are kept (country prefix); every later digit is replaced. Length and separators are kept.
CREATE OR REPLACE FUNCTION sys.mask_phone(phone text) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  b bytea;
  out text := '';
  c text;
  val integer;
BEGIN
  IF phone IS NULL THEN RETURN NULL; END IF;
  b := sys.mask_bytes(phone);
  FOR i IN 1..length(phone) LOOP
    c := substr(phone, i, 1);
    val := get_byte(b, (i - 1) % 32);
    IF i > 2 AND c ~ '[0-9]' THEN out := out || (val % 10)::text;
    ELSE out := out || c;
    END IF;
  END LOOP;
  RETURN out;
END $$;

-- Email: the domain is kept; the local part becomes a 10-character hex token.
CREATE OR REPLACE FUNCTION sys.mask_email(email text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN email IS NULL OR position('@' in email) = 0 THEN NULL
    ELSE sys.hex_digits(split_part(email, '@', 1), 10) || '@' || split_part(email, '@', 2) END
$$;

-- Bank account: keeps the last 4 characters.
CREATE OR REPLACE FUNCTION sys.mask_account(account text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN account IS NULL THEN NULL
    WHEN length(account) <= 4 THEN repeat('X', length(account))
    ELSE repeat('X', length(account) - 4) || right(account, 4) END
$$;

-- Access. The application role reads and writes only what it needs and never has DDL (REQ-DBF-F15).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT USAGE ON SCHEMA sys TO erp_app;
    GRANT EXECUTE ON FUNCTION sys.current_tenant_id(), sys.current_user_id() TO erp_app;
    REVOKE ALL ON sys.migration_runs FROM erp_app;
  END IF;
END $$;
