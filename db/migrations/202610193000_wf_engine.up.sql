-- Part 16 slice S1: workflow definitions, instances, tasks and the action log (module wf). Tenant-scoped with RLS.
-- Definitions are versioned; a running instance keeps the version it started on (A-147). Activation is maker-checker (CP-WF-04).
CREATE TABLE wf_definitions (
  tenant_id       uuid        NOT NULL,
  doc_type        text        NOT NULL CHECK (doc_type ~ '^[a-z][a-z0-9_]{1,40}$'),
  version         integer     NOT NULL CHECK (version >= 1),
  status          text        NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  machine         jsonb       NOT NULL,
  effective_from  date        NOT NULL,
  created_by      text        NOT NULL,
  activated_by    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  PRIMARY KEY (tenant_id, doc_type, version),
  CHECK (activated_by IS NULL OR activated_by <> created_by),
  CHECK (status <> 'active' OR activated_by IS NOT NULL)
);
CREATE UNIQUE INDEX wf_definitions_one_active ON wf_definitions (tenant_id, doc_type) WHERE status = 'active';
SELECT sys.enable_tenant_rls('wf_definitions'::regclass);

-- One open instance per document (A-148: an amendment starts a new instance after the old one closes).
CREATE TABLE wf_instances (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id          uuid        NOT NULL,
  doc_type           text        NOT NULL,
  doc_id             text        NOT NULL CHECK (length(doc_id) BETWEEN 1 AND 80),
  definition_version integer     NOT NULL,
  state              text        NOT NULL CHECK (length(state) BETWEEN 1 AND 60),
  state_version      integer     NOT NULL DEFAULT 1 CHECK (state_version >= 1),
  amount_snapshot    numeric(18,2),
  submitted_by       text        NOT NULL,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz,
  FOREIGN KEY (tenant_id, doc_type, definition_version) REFERENCES wf_definitions (tenant_id, doc_type, version)
);
CREATE UNIQUE INDEX wf_instances_open_doc ON wf_instances (tenant_id, doc_type, doc_id) WHERE closed_at IS NULL;
SELECT sys.enable_tenant_rls('wf_instances'::regclass);

-- One task per person per instance: nobody holds two levels of one instance (CP-WF-01).
CREATE TABLE wf_tasks (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    uuid        NOT NULL,
  instance_id  bigint      NOT NULL REFERENCES wf_instances (id),
  step         text        NOT NULL CHECK (length(step) BETWEEN 1 AND 60),
  assignee     text        NOT NULL,
  status       text        NOT NULL CHECK (status IN ('open', 'approved', 'rejected', 'returned', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  acted_at     timestamptz,
  acted_by     text,
  comment      text,
  reason_code  text,
  UNIQUE (tenant_id, instance_id, assignee)
);
CREATE INDEX wf_tasks_open ON wf_tasks (tenant_id, assignee) WHERE status = 'open';
SELECT sys.enable_tenant_rls('wf_tasks'::regclass);

-- Append-only record of every action. The state version is unique per instance, so two actions on one version cannot both land.
CREATE TABLE wf_action_log (
  id                    bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id             uuid        NOT NULL,
  instance_id           bigint      NOT NULL REFERENCES wf_instances (id),
  task_id               bigint      REFERENCES wf_tasks (id),
  action                text        NOT NULL CHECK (action IN ('submit', 'approve', 'reject', 'return', 'resubmit', 'recall', 'cancel', 'reassign', 'comment')),
  actor                 text        NOT NULL,
  state_version_before  integer     NOT NULL,
  state_version_after   integer     NOT NULL,
  comment               text,
  reason_code           text,
  idempotency_key       text        CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  at                    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, instance_id, state_version_after),
  UNIQUE (tenant_id, idempotency_key)
);
SELECT sys.enable_tenant_rls('wf_action_log'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON wf_definitions, wf_instances, wf_tasks TO erp_app;
    GRANT SELECT, INSERT ON wf_action_log TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
