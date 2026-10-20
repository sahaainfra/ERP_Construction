-- Part 07 slice S1: authentication engine (module iam). Credentials, password reset, devices, sessions with rotating refresh
-- tokens, TOTP factors. Tenant-scoped with row-level security. Secrets are never stored in clear: passwords are scrypt hashes,
-- reset tokens and refresh tokens are SHA-256 hashes, TOTP secrets are AES-256-GCM ciphertext.

CREATE TABLE iam_credentials (
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL CHECK (length(user_ref) BETWEEN 1 AND 100),
  password_hash     text        NOT NULL CHECK (password_hash ~ '^scrypt\$'),
  changed_at        timestamptz NOT NULL DEFAULT now(),
  failed_count      integer     NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until      timestamptz,
  last_login_at     timestamptz,
  PRIMARY KEY (tenant_id, user_ref)
);
SELECT sys.enable_tenant_rls('iam_credentials'::regclass);

CREATE TABLE iam_password_resets (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL,
  token_hash        char(64)    NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at        timestamptz NOT NULL,
  used_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_password_resets_window CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX iam_password_resets_token ON iam_password_resets (token_hash);
SELECT sys.enable_tenant_rls('iam_password_resets'::regclass);

CREATE TABLE iam_devices (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL,
  fingerprint_hash  char(64)    NOT NULL CHECK (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  trust_level       text        NOT NULL DEFAULT 'unknown' CHECK (trust_level IN ('managed','known','unknown')),
  label             text        CHECK (label IS NULL OR length(label) <= 100),
  first_seen        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  CONSTRAINT iam_devices_unique UNIQUE (tenant_id, user_ref, fingerprint_hash)
);
SELECT sys.enable_tenant_rls('iam_devices'::regclass);

-- One row per signed-in session. The refresh token rotates: the previous hashes are kept so that reuse of an old token is
-- detected and the whole family (every session started from that sign-in) is revoked.
CREATE TABLE iam_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL,
  device_id         uuid        NOT NULL REFERENCES iam_devices (id),
  family_id         uuid        NOT NULL,
  refresh_hash      char(64)    NOT NULL CHECK (refresh_hash ~ '^[0-9a-f]{64}$'),
  previous_hashes   text[]      NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  idle_expires_at   timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at        timestamptz,
  revoke_reason     text,
  CONSTRAINT iam_sessions_window CHECK (absolute_expires_at >= idle_expires_at)
);
CREATE INDEX iam_sessions_family ON iam_sessions (tenant_id, family_id);
CREATE INDEX iam_sessions_user ON iam_sessions (tenant_id, user_ref);
SELECT sys.enable_tenant_rls('iam_sessions'::regclass);

-- TOTP factor (RFC 6238). The secret is encrypted; last_used_step prevents a code from being replayed.
CREATE TABLE iam_mfa_factors (
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL,
  kind              text        NOT NULL DEFAULT 'totp' CHECK (kind = 'totp'),
  secret_ciphertext text        NOT NULL,
  last_used_step    bigint      NOT NULL DEFAULT -1,
  confirmed_at      timestamptz,
  enrolled_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_ref, kind)
);
SELECT sys.enable_tenant_rls('iam_mfa_factors'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON iam_credentials, iam_password_resets, iam_devices, iam_sessions, iam_mfa_factors TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
