-- Part 07 slice S3: segregation-of-duties (SoD) rules, the action log they read, actor links, exceptions and findings (module iam).
-- Tenant-scoped with row-level security. The action log and findings are append-only.
-- Concurrency: an action on a record takes a transaction-scoped advisory lock on that record (see src/iam/sod.ts).

CREATE TABLE iam_sod_rules (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  rule_code         text        NOT NULL CHECK (rule_code ~ '^[A-Z][A-Z0-9_]{2,40}$'),
  description       text        NOT NULL CHECK (length(description) BETWEEN 10 AND 300),
  left_action       text        NOT NULL CHECK (left_action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$'),
  right_action      text        NOT NULL CHECK (right_action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$'),
  exception_allowed boolean     NOT NULL DEFAULT true,
  enforcement       text        NOT NULL DEFAULT 'draft' CHECK (enforcement IN ('draft','observe','enforce','retired')),
  created_by        text        NOT NULL,
  approved_by       text,
  enforce_approved_by text,
  change_reason     text        NOT NULL CHECK (length(change_reason) >= 10),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_sod_rules_code_unique UNIQUE (tenant_id, rule_code),
  CONSTRAINT iam_sod_rules_distinct CHECK (left_action <> right_action),
  CONSTRAINT iam_sod_rules_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT iam_sod_rules_enforce_checker CHECK (enforce_approved_by IS NULL OR enforce_approved_by <> COALESCE(approved_by, created_by)),
  CONSTRAINT iam_sod_rules_enforce_needs_approval CHECK (enforcement NOT IN ('enforce') OR (approved_by IS NOT NULL AND enforce_approved_by IS NOT NULL))
);
SELECT sys.enable_tenant_rls('iam_sod_rules'::regclass);

-- Who did what to which record, in order. Written in the same transaction as the action (append-only).
CREATE TABLE iam_action_log (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  actor_ref         text        NOT NULL,
  action_key        text        NOT NULL CHECK (action_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$'),
  entity_type       text        NOT NULL CHECK (length(entity_type) BETWEEN 2 AND 60),
  entity_id         text        NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 100),
  correlation_id    text        NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX iam_action_log_entity ON iam_action_log (tenant_id, entity_type, entity_id);
SELECT sys.enable_tenant_rls('iam_action_log'::regclass);
SELECT sys.enforce_append_only('iam_action_log'::regclass);

-- Two accounts that belong to one employee are one actor for SoD (REQ-IAM-F15).
CREATE TABLE iam_actor_links (
  tenant_id         uuid        NOT NULL,
  actor_ref         text        NOT NULL,
  person_ref        text        NOT NULL CHECK (length(person_ref) BETWEEN 1 AND 100),
  linked_by         text        NOT NULL,
  PRIMARY KEY (tenant_id, actor_ref)
);
SELECT sys.enable_tenant_rls('iam_actor_links'::regclass);

-- A time-boxed, project-scoped exception to one rule for one person (REQ-IAM-F16). At most 90 days.
CREATE TABLE iam_sod_exceptions (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  rule_id           bigint      NOT NULL REFERENCES iam_sod_rules (id),
  person_ref        text        NOT NULL,
  project_id        text,
  reason            text        NOT NULL CHECK (length(reason) >= 20),
  compensating_control text     NOT NULL CHECK (length(compensating_control) >= 20),
  valid_from        date        NOT NULL,
  valid_to          date        NOT NULL,
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_by        text        NOT NULL,
  approved_by       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_sod_exceptions_window CHECK (valid_to >= valid_from AND valid_to - valid_from <= 90),
  CONSTRAINT iam_sod_exceptions_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT iam_sod_exceptions_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('iam_sod_exceptions'::regclass);

-- Violations found by the detective scan or by an observe-mode rule. Never deleted; resolved by an owner.
CREATE TABLE iam_sod_findings (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  rule_id           bigint      NOT NULL REFERENCES iam_sod_rules (id),
  person_ref        text        NOT NULL,
  entity_type       text        NOT NULL,
  entity_id         text        NOT NULL,
  source            text        NOT NULL CHECK (source IN ('preventive_observe','detective_scan')),
  status            text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  detected_at       timestamptz NOT NULL DEFAULT now()
);
-- Findings are append-only: resolving one inserts a 'resolved' row, so the latest row for a key gives its status.
CREATE INDEX iam_sod_findings_key ON iam_sod_findings (tenant_id, rule_id, entity_type, entity_id, person_ref, detected_at DESC);
SELECT sys.enable_tenant_rls('iam_sod_findings'::regclass);
SELECT sys.enforce_append_only('iam_sod_findings'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON iam_sod_rules, iam_sod_exceptions, iam_actor_links TO erp_app;
    GRANT SELECT, INSERT ON iam_action_log, iam_sod_findings TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
