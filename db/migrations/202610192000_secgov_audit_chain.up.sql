-- Part 08 slice S1: the audit chain (module secgov). Replaces the interim core_audit_entries behind the unit-of-work interface
-- (D-034). Each row carries the hash of the row before it, per tenant, so a changed or removed row breaks the chain.
-- Append-only: the application role may INSERT and SELECT only. Corrections are new rows.

CREATE TABLE sec_audit_log (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  seq               bigint      NOT NULL CHECK (seq >= 1),
  occurred_at       timestamptz NOT NULL,
  actor_ref         text        NOT NULL CHECK (length(actor_ref) BETWEEN 1 AND 100),
  impersonated_by   text,
  session_id        text,
  correlation_id    text        NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 100),
  causation_id      text,
  module            text        NOT NULL CHECK (module ~ '^[a-z][a-z0-9_]{1,30}$'),
  entity_type       text        NOT NULL CHECK (length(entity_type) BETWEEN 2 AND 60),
  entity_id         text        NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 100),
  action            text        NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  before_json       jsonb,
  after_json        jsonb,
  changed_fields    text[]      NOT NULL DEFAULT '{}',
  reason_code       text,
  reason            text,
  prev_hash         char(64)    NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  hash              char(64)    NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sec_audit_log_seq UNIQUE (tenant_id, seq)
);
CREATE INDEX sec_audit_log_entity ON sec_audit_log (tenant_id, entity_type, entity_id, seq);
CREATE INDEX sec_audit_log_actor ON sec_audit_log (tenant_id, actor_ref, occurred_at);
CREATE INDEX sec_audit_log_correlation ON sec_audit_log (tenant_id, correlation_id);
SELECT sys.enable_tenant_rls('sec_audit_log'::regclass);
SELECT sys.enforce_append_only('sec_audit_log'::regclass);

-- Sensitive reads (REQ-SECGOV-F05): who looked at salary, bank, PAN and other flagged fields, and when. Append-only.
CREATE TABLE sec_sensitive_reads (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  actor_ref         text        NOT NULL,
  entity_type       text        NOT NULL,
  entity_id         text        NOT NULL,
  fields            text[]      NOT NULL CHECK (cardinality(fields) >= 1),
  reason            text,
  correlation_id    text        NOT NULL
);
CREATE INDEX sec_sensitive_reads_entity ON sec_sensitive_reads (tenant_id, entity_type, entity_id, occurred_at);
SELECT sys.enable_tenant_rls('sec_sensitive_reads'::regclass);
SELECT sys.enforce_append_only('sec_sensitive_reads'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT ON sec_audit_log, sec_sensitive_reads TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
