-- Part 16 slice S2: decision tables, instance context and split keys (module wf). Tenant-scoped with RLS.
-- A decision table cannot be activated until it has been simulated (CP-WF-04) and the activator is someone other than its author.
ALTER TABLE wf_instances ADD COLUMN context_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_json) = 'object');
-- The key that cumulative evaluation groups by (vendor, material and project, A-149). Null when the document has no split key.
ALTER TABLE wf_instances ADD COLUMN split_key text CHECK (length(split_key) BETWEEN 3 AND 300);
CREATE INDEX wf_instances_split ON wf_instances (tenant_id, split_key, submitted_at) WHERE split_key IS NOT NULL;

CREATE TABLE rul_decision_tables (
  tenant_id       uuid        NOT NULL,
  code            text        NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  version         integer     NOT NULL CHECK (version >= 1),
  status          text        NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  table_json      jsonb       NOT NULL CHECK (jsonb_typeof(table_json) = 'object'),
  effective_from  date        NOT NULL DEFAULT CURRENT_DATE,
  created_by      text        NOT NULL,
  activated_by    text,
  simulated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  PRIMARY KEY (tenant_id, code, version),
  CHECK (activated_by IS NULL OR activated_by <> created_by),
  CHECK (status <> 'active' OR (activated_by IS NOT NULL AND simulated_at IS NOT NULL))
);
CREATE UNIQUE INDEX rul_decision_tables_one_active ON rul_decision_tables (tenant_id, code) WHERE status = 'active';
SELECT sys.enable_tenant_rls('rul_decision_tables'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON rul_decision_tables TO erp_app;
  END IF;
END
$$;
