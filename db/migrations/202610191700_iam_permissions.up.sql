-- Part 07 slice S2: permission registry, roles, scoped assignments, field policies and authority limits (module iam).
-- The registry and field policies are global catalogues (no tenant). Roles, role grants, assignments and limits are
-- tenant-scoped with row-level security (ADR-002). Role grants and assignments need a second approver (CP-IAM-01).

CREATE TABLE iam_permissions (
  permission_key    text        PRIMARY KEY CHECK (permission_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$'),
  module_code       text        NOT NULL CHECK (module_code ~ '^[a-z][a-z0-9_]{1,30}$'),
  description       text        NOT NULL CHECK (length(description) BETWEEN 5 AND 300),
  protocol_stage    text        NOT NULL CHECK (protocol_stage IN ('PLAN','VERIFY','APPROVE','RECORD','MONITOR','RECONCILE','CLOSE')),
  sensitivity       text        NOT NULL DEFAULT 'standard' CHECK (sensitivity IN ('standard','sensitive','privileged')),
  registered_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE iam_roles (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  role_code         text        NOT NULL CHECK (role_code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name              text        NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by        text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_roles_code_unique UNIQUE (tenant_id, role_code)
);
SELECT sys.enable_tenant_rls('iam_roles'::regclass);

-- A permission on a role. Effective only once approved. An explicit deny beats any allow (deny by default otherwise).
CREATE TABLE iam_role_permissions (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  role_id           bigint      NOT NULL REFERENCES iam_roles (id),
  permission_key    text        NOT NULL REFERENCES iam_permissions (permission_key),
  effect            text        NOT NULL CHECK (effect IN ('allow','deny')),
  conditions        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_by        text        NOT NULL,
  approved_by       text,
  change_reason     text        NOT NULL CHECK (length(change_reason) >= 10),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_role_permissions_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT iam_role_permissions_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL),
  CONSTRAINT iam_role_permissions_conditions CHECK (jsonb_typeof(conditions) = 'object')
);
CREATE INDEX iam_role_permissions_role ON iam_role_permissions (tenant_id, role_id, permission_key);
SELECT sys.enable_tenant_rls('iam_role_permissions'::regclass);

-- A role held by a person within a scope and a validity window. Effective once approved (CP-IAM-01).
CREATE TABLE iam_user_role_assignments (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL CHECK (length(user_ref) BETWEEN 1 AND 100),
  role_id           bigint      NOT NULL REFERENCES iam_roles (id),
  scope_type        text        NOT NULL CHECK (scope_type IN ('tenant','company','legal_entity','branch','department','project','site','own')),
  scope_id          text        CHECK (scope_id IS NULL OR length(scope_id) BETWEEN 1 AND 100),
  valid_from        date        NOT NULL,
  valid_to          date,
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_by        text        NOT NULL,
  approved_by       text,
  reason            text        NOT NULL CHECK (length(reason) >= 10),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_assignments_scope CHECK ((scope_type IN ('tenant','own')) = (scope_id IS NULL)),
  CONSTRAINT iam_assignments_dates CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT iam_assignments_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT iam_assignments_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL)
);
CREATE INDEX iam_assignments_user ON iam_user_role_assignments (tenant_id, user_ref);
SELECT sys.enable_tenant_rls('iam_user_role_assignments'::regclass);

-- Authority limits on approvals: the most a person may approve by document type, project and category (REQ-IAM-F10).
CREATE TABLE iam_authority_limits (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL,
  doc_type          text        NOT NULL CHECK (length(doc_type) BETWEEN 2 AND 40),
  project_id        bigint      REFERENCES org_projects (id),
  category          text        CHECK (category IS NULL OR length(category) BETWEEN 2 AND 60),
  max_amount_paise  bigint      NOT NULL CHECK (max_amount_paise >= 0),
  valid_from        date        NOT NULL,
  valid_to          date,
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_by        text        NOT NULL,
  approved_by       text,
  reason            text        NOT NULL CHECK (length(reason) >= 10),
  CONSTRAINT iam_authority_limits_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT iam_authority_limits_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('iam_authority_limits'::regclass);

-- Field-level policy (REQ-IAM-F09): who may view a sensitive field, and how it is masked for everyone else. Global catalogue.
CREATE TABLE iam_field_policies (
  entity_type       text        NOT NULL CHECK (length(entity_type) BETWEEN 2 AND 60),
  field_name        text        NOT NULL CHECK (length(field_name) BETWEEN 2 AND 60),
  view_permission_key text      NOT NULL REFERENCES iam_permissions (permission_key),
  mask_type         text        NOT NULL CHECK (mask_type IN ('full','partial','hash')),
  PRIMARY KEY (entity_type, field_name)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON iam_permissions, iam_field_policies TO erp_app;
    GRANT SELECT, INSERT, UPDATE ON iam_roles, iam_role_permissions, iam_user_role_assignments, iam_authority_limits TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
