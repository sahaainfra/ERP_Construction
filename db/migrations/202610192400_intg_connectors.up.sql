-- Part 11 slice S1: connectors, credential references (encrypted, maker-checker), mappings, messages and the dead-letter queue
-- (module intg). Tenant-scoped with row-level security. Additive: no existing table changes.

CREATE TABLE intg_connectors (
  tenant_id            uuid        NOT NULL,
  code                 text        NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  connector_type       text        NOT NULL CHECK (connector_type ~ '^[a-z][a-z0-9_]{1,40}$'),
  status               text        NOT NULL DEFAULT 'configured_untested'
                       CHECK (status IN ('configured_untested', 'active', 'unavailable', 'failed')),
  allowed_hosts        text[]      NOT NULL DEFAULT '{}',
  config               jsonb       NOT NULL DEFAULT '{}',
  consecutive_failures integer     NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_success_at      timestamptz,
  last_failure_at      timestamptz,
  created_by           text        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, code)
);
SELECT sys.enable_tenant_rls('intg_connectors'::regclass);

-- One row per secret version. The ciphertext is AES-256-GCM (A-58); the plaintext is never stored and never returned.
CREATE TABLE intg_credentials_ref (
  tenant_id       uuid        NOT NULL,
  connector_code  text        NOT NULL,
  version         integer     NOT NULL CHECK (version >= 1),
  ciphertext      text        NOT NULL CHECK (ciphertext ~ '^[A-Za-z0-9+/=]+$'),
  status          text        NOT NULL CHECK (status IN ('pending_approval', 'active', 'superseded')),
  created_by      text        NOT NULL,
  approved_by     text,
  reason          text        NOT NULL CHECK (length(reason) >= 10),
  created_at      timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz,
  PRIMARY KEY (tenant_id, connector_code, version),
  CONSTRAINT intg_credentials_approver CHECK (status = 'pending_approval' OR approved_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('intg_credentials_ref'::regclass);
-- At most one active secret per connector.
CREATE UNIQUE INDEX intg_credentials_one_active ON intg_credentials_ref (tenant_id, connector_code) WHERE status = 'active';

-- Code mappings between the ERP and an external system. A version is never overwritten: a change adds a version.
CREATE TABLE intg_mappings (
  tenant_id       uuid        NOT NULL,
  connector_code  text        NOT NULL,
  entity          text        NOT NULL CHECK (entity IN ('item', 'ledger', 'cost_centre', 'employee', 'vendor', 'bank_code')),
  erp_code        text        NOT NULL CHECK (length(erp_code) BETWEEN 1 AND 64),
  ext_code        text        NOT NULL CHECK (length(ext_code) BETWEEN 1 AND 64),
  version         integer     NOT NULL CHECK (version >= 1),
  status          text        NOT NULL CHECK (status IN ('active', 'superseded')),
  created_by      text        NOT NULL,
  reason          text        NOT NULL CHECK (length(reason) >= 10),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, connector_code, entity, erp_code, version)
);
SELECT sys.enable_tenant_rls('intg_mappings'::regclass);
CREATE UNIQUE INDEX intg_mappings_one_active ON intg_mappings (tenant_id, connector_code, entity, erp_code) WHERE status = 'active';

-- One row per call attempt (outcome and timing, not payloads). Payloads are referenced by hash only.
CREATE TABLE intg_messages (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  connector_code  text        NOT NULL,
  operation       text        NOT NULL CHECK (operation ~ '^[a-z][a-z0-9_.]{1,60}$'),
  direction       text        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  correlation_id  text        NOT NULL,
  status          text        NOT NULL CHECK (status IN ('succeeded', 'failed', 'refused')),
  attempts        integer     NOT NULL CHECK (attempts >= 1),
  duration_ms     integer     NOT NULL CHECK (duration_ms >= 0),
  error_code      text,
  payload_hash    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intg_messages_connector ON intg_messages (tenant_id, connector_code, created_at DESC);
SELECT sys.enable_tenant_rls('intg_messages'::regclass);

CREATE TABLE intg_dlq (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  connector_code  text        NOT NULL,
  message_id      bigint      NOT NULL REFERENCES intg_messages (id),
  reason          text        NOT NULL,
  payload_hash    text,
  status          text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replayed', 'discarded')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
SELECT sys.enable_tenant_rls('intg_dlq'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON intg_connectors, intg_credentials_ref, intg_mappings TO erp_app;
    GRANT SELECT, INSERT, UPDATE ON intg_messages, intg_dlq TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
