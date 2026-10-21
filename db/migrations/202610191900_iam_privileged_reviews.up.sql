-- Part 07 slices S4–S5: privileged elevation, revocations (joiner/mover/leaver), access reviews, export controls and shadow
-- comparisons (module iam). Tenant-scoped with row-level security. Exports and shadow comparisons are append-only.

CREATE TABLE iam_elevations (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL,
  permission_key    text        NOT NULL REFERENCES iam_permissions (permission_key),
  reason            text        NOT NULL CHECK (length(reason) >= 20),
  requested_hours   integer     NOT NULL CHECK (requested_hours BETWEEN 1 AND 4),
  state             text        NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','approved','rejected','ended')),
  created_by        text        NOT NULL,
  approved_by       text,
  approved_at       timestamptz,
  expires_at        timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_elevations_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT iam_elevations_approved CHECK (state NOT IN ('approved','ended') OR (approved_by IS NOT NULL AND expires_at IS NOT NULL))
);
SELECT sys.enable_tenant_rls('iam_elevations'::regclass);

-- A person's access is revoked (leaver). The request pipeline refuses revoked people. Cleared only by an administrator.
CREATE TABLE iam_revocations (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL,
  reason            text        NOT NULL CHECK (length(reason) >= 10),
  revoked_by        text        NOT NULL,
  revoked_at        timestamptz NOT NULL DEFAULT now(),
  cleared_at        timestamptz
);
CREATE INDEX iam_revocations_user ON iam_revocations (tenant_id, user_ref);
SELECT sys.enable_tenant_rls('iam_revocations'::regclass);

CREATE TABLE iam_access_reviews (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  scope_type        text        NOT NULL CHECK (scope_type IN ('company','project')),
  scope_id          text        NOT NULL CHECK (length(scope_id) BETWEEN 1 AND 100),
  due_on            date        NOT NULL,
  grace_days        integer     NOT NULL DEFAULT 14 CHECK (grace_days BETWEEN 0 AND 30),
  status            text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by        text        NOT NULL,
  closed_by         text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_access_reviews_closed CHECK (status <> 'closed' OR closed_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('iam_access_reviews'::regclass);

CREATE TABLE iam_access_review_items (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  review_id         bigint      NOT NULL REFERENCES iam_access_reviews (id),
  assignment_id     bigint      NOT NULL REFERENCES iam_user_role_assignments (id),
  user_ref          text        NOT NULL,
  reviewer_ref      text        NOT NULL,
  decision          text        NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','keep','revoke','expired_revoked')),
  decided_by        text,
  decided_at        timestamptz,
  reason            text,
  CONSTRAINT iam_review_items_unique UNIQUE (review_id, assignment_id),
  CONSTRAINT iam_review_items_not_self CHECK (decided_by IS NULL OR decided_by <> user_ref),
  CONSTRAINT iam_review_items_decided CHECK (decision = 'pending' OR decided_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('iam_access_review_items'::regclass);

CREATE TABLE iam_export_rules (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  report_key        text        NOT NULL CHECK (report_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$'),
  permission_key    text        NOT NULL REFERENCES iam_permissions (permission_key),
  max_rows          integer     NOT NULL CHECK (max_rows > 0),
  step_up_above_rows integer    NOT NULL CHECK (step_up_above_rows >= 0),
  created_by        text        NOT NULL,
  CONSTRAINT iam_export_rules_unique UNIQUE (tenant_id, report_key),
  CONSTRAINT iam_export_rules_threshold CHECK (step_up_above_rows <= max_rows)
);
SELECT sys.enable_tenant_rls('iam_export_rules'::regclass);

CREATE TABLE iam_export_events (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL,
  report_key        text        NOT NULL,
  row_count         integer     NOT NULL CHECK (row_count >= 0),
  step_up_verified  boolean     NOT NULL,
  decision          text        NOT NULL CHECK (decision IN ('allowed','denied','step_up_required')),
  watermark         text,
  correlation_id    text        NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now()
);
SELECT sys.enable_tenant_rls('iam_export_events'::regclass);
SELECT sys.enforce_append_only('iam_export_events'::regclass);

-- Shadow comparisons: the new engine's decision against a legacy decision (REQ-IAM-F13). Every comparison is kept, match or
-- not, so readiness can be judged from counts. Append-only.
CREATE TABLE iam_shadow_comparisons (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  module_code       text        NOT NULL CHECK (module_code ~ '^[a-z][a-z0-9_]{1,30}$'),
  action_key        text        NOT NULL,
  user_ref          text        NOT NULL,
  legacy_allowed    boolean     NOT NULL,
  engine_allowed    boolean     NOT NULL,
  matched           boolean     NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_shadow_matched CHECK (matched = (legacy_allowed = engine_allowed))
);
CREATE INDEX iam_shadow_comparisons_module ON iam_shadow_comparisons (tenant_id, module_code, occurred_at);
SELECT sys.enable_tenant_rls('iam_shadow_comparisons'::regclass);
SELECT sys.enforce_append_only('iam_shadow_comparisons'::regclass);

-- A revocation takes effect at once. The end date alone cannot do that: it is inclusive, so a grant ended today stays live
-- until midnight. revoked_at is checked by the decision function.
ALTER TABLE iam_user_role_assignments ADD COLUMN revoked_at timestamptz;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON iam_elevations, iam_revocations, iam_access_reviews, iam_access_review_items, iam_export_rules TO erp_app;
    GRANT SELECT, INSERT ON iam_export_events, iam_shadow_comparisons TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
