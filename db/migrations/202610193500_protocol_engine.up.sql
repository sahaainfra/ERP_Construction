-- Part 17 slice S1: control-point registry, evaluation log and duplicate fingerprints (module protocol). Tenant-scoped with RLS.
-- A control point is versioned data. Activation is maker-checker (CP-PROTOCOL-03). The evaluation log and fingerprints are append-only.
CREATE TABLE protocol_control_points (
  tenant_id       uuid        NOT NULL,
  cp_code         text        NOT NULL CHECK (cp_code ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  version         integer     NOT NULL CHECK (version >= 1),
  status          text        NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  title           text        NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  stage           text        NOT NULL CHECK (stage IN ('PLAN', 'VERIFY', 'APPROVE', 'RECORD', 'EXECUTE', 'RECONCILE', 'CLOSE', 'MONITOR')),
  check_kind      text        NOT NULL CHECK (check_kind IN ('PLAN_EXISTS', 'BUDGET_AVAILABLE', 'STOCK_AVAILABLE', 'BALANCE_QTY', 'DUPLICATE', 'THRESHOLD', 'DOCUMENT_REQUIRED', 'SOD', 'CERTIFICATION_VALID', 'PERMIT_VALID', 'SPEC_APPROVED', 'DRAWING_CURRENT', 'TIME_WINDOW', 'SEQUENCE', 'GEO_FENCE', 'RECONCILIATION', 'CUSTOM')),
  params          jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(params) = 'object'),
  enforcement     text        NOT NULL CHECK (enforcement IN ('BLOCK', 'WARN', 'EXCEPTION')),
  owner_role      text        NOT NULL CHECK (owner_role ~ '^[a-z][a-z0-9_]{1,40}$'),
  created_by      text        NOT NULL,
  activated_by    text,
  effective_from  date        NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  PRIMARY KEY (tenant_id, cp_code, version),
  CHECK (activated_by IS NULL OR activated_by <> created_by),
  CHECK (status <> 'active' OR activated_by IS NOT NULL)
);
CREATE UNIQUE INDEX protocol_control_points_one_active ON protocol_control_points (tenant_id, cp_code) WHERE status = 'active';
SELECT sys.enable_tenant_rls('protocol_control_points'::regclass);

-- Every evaluation, with the inputs it was given (REQ-PROTOCOL-F02). Mode and enforcement are recorded so an OBSERVE result can be reviewed later.
CREATE TABLE protocol_evaluations (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  cp_code         text        NOT NULL,
  cp_version      integer     NOT NULL,
  mode            text        NOT NULL CHECK (mode IN ('OFF', 'OBSERVE', 'WARN', 'ENFORCE')),
  enforcement     text        NOT NULL CHECK (enforcement IN ('BLOCK', 'WARN', 'EXCEPTION')),
  result          text        NOT NULL CHECK (result IN ('PASS', 'WARN', 'EXCEPTION_REQUIRED', 'BLOCK', 'UNAVAILABLE', 'WOULD_WARN', 'WOULD_BLOCK', 'WOULD_EXCEPTION')),
  reasons         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  inputs          jsonb       NOT NULL CHECK (jsonb_typeof(inputs) = 'object'),
  correlation_id  text        NOT NULL,
  evaluated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX protocol_evaluations_cp ON protocol_evaluations (tenant_id, cp_code, evaluated_at);
SELECT sys.enable_tenant_rls('protocol_evaluations'::regclass);

-- A fingerprint is recorded once a transaction passes a duplicate check, so a repeat inside the window is seen.
CREATE TABLE protocol_fingerprints (
  tenant_id    uuid        NOT NULL,
  cp_code      text        NOT NULL,
  fingerprint  text        NOT NULL CHECK (length(fingerprint) BETWEEN 8 AND 200),
  entity_id    text        NOT NULL,
  seen_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, cp_code, fingerprint, entity_id)
);
CREATE INDEX protocol_fingerprints_window ON protocol_fingerprints (tenant_id, cp_code, fingerprint, seen_at);
SELECT sys.enable_tenant_rls('protocol_fingerprints'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON protocol_control_points TO erp_app;
    GRANT SELECT, INSERT ON protocol_evaluations, protocol_fingerprints TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
