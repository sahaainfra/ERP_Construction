-- Part 13 slice S1: role spaces (versioned defaults per role) and personal workspace overrides (module dash). Tenant-scoped with RLS.
-- A role space is published by maker-checker (Part 13 S2); this migration only stores versions. Additive.
CREATE TABLE ui_role_spaces (
  tenant_id     uuid        NOT NULL,
  role_code     text        NOT NULL CHECK (role_code ~ '^[a-z][a-z0-9_]{1,40}$'),
  version       integer     NOT NULL CHECK (version >= 1),
  widget_codes  text[]      NOT NULL CHECK (cardinality(widget_codes) BETWEEN 1 AND 20),
  status        text        NOT NULL CHECK (status IN ('proposed', 'active', 'superseded')),
  created_by    text        NOT NULL,
  approved_by   text,
  reason        text        NOT NULL CHECK (length(reason) >= 10),
  created_at    timestamptz NOT NULL DEFAULT now(),
  approved_at   timestamptz,
  PRIMARY KEY (tenant_id, role_code, version),
  CONSTRAINT ui_role_spaces_approver CHECK (status = 'proposed' OR approved_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('ui_role_spaces'::regclass);
CREATE UNIQUE INDEX ui_role_spaces_one_active ON ui_role_spaces (tenant_id, role_code) WHERE status = 'active';

-- A person's own arrangement: the widgets they chose, in order, with their sizes. Reset deletes the row.
CREATE TABLE ui_user_space_overrides (
  tenant_id   uuid        NOT NULL,
  user_id     text        NOT NULL CHECK (length(user_id) BETWEEN 1 AND 80),
  widgets     jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(widgets) = 'array' AND jsonb_array_length(widgets) <= 20),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
SELECT sys.enable_tenant_rls('ui_user_space_overrides'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ui_role_spaces, ui_user_space_overrides TO erp_app;
  END IF;
END
$$;
