-- Part 08A slice S1: users, User ID series, password history (module auth). Tenant-scoped with row-level security.
-- The credential store, sessions, lockout and MFA are the Part 07 tables (iam_*), keyed by user_id (A-32).

CREATE TABLE auth_id_series (
  tenant_id         uuid        NOT NULL,
  company_code      text        NOT NULL CHECK (company_code ~ '^[A-Z][A-Z0-9]{1,7}$'),
  next_value        bigint      NOT NULL DEFAULT 1 CHECK (next_value >= 1),
  PRIMARY KEY (tenant_id, company_code)
);
SELECT sys.enable_tenant_rls('auth_id_series'::regclass);

CREATE TABLE auth_users (
  tenant_id         uuid        NOT NULL,
  user_id           text        NOT NULL CHECK (user_id ~ '^[A-Z][A-Z0-9]{1,7}[0-9]{5,}$'),
  person_type       text        NOT NULL CHECK (person_type IN ('internal','field','kiosk','external','service')),
  person_ref        text,
  display_name      text        NOT NULL CHECK (length(display_name) BETWEEN 2 AND 200),
  state             text        NOT NULL DEFAULT 'pending_activation' CHECK (state IN ('pending_activation','active','locked','suspended','deactivated','expired')),
  valid_from        date        NOT NULL DEFAULT CURRENT_DATE,
  valid_to          date,
  must_change       boolean     NOT NULL DEFAULT true,
  created_by        text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz,
  state_reason      text,
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT auth_users_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
SELECT sys.enable_tenant_rls('auth_users'::regclass);

-- Previous password hashes, so that a password cannot be reused (last five). Hashes only, never plaintext.
CREATE TABLE auth_password_history (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  user_id           text        NOT NULL,
  password_hash     text        NOT NULL CHECK (password_hash ~ '^scrypt\$'),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_password_history_user ON auth_password_history (tenant_id, user_id, created_at DESC);
SELECT sys.enable_tenant_rls('auth_password_history'::regclass);
SELECT sys.enforce_append_only('auth_password_history'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON auth_id_series, auth_users TO erp_app;
    GRANT SELECT, INSERT ON auth_password_history TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
