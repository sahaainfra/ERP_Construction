-- Part 06 slices S3–S4: location breakdown (LBS), site geofences, project allocations and user contexts (module org).
-- Tenant-scoped with row-level security. Geofence versions are approved by a second person and never edited in place.

CREATE TABLE org_locations (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  project_id        bigint      NOT NULL REFERENCES org_projects (id),
  parent_id         bigint      REFERENCES org_locations (id),
  code              text        NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_.-]{0,39}$'),
  name              text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  location_type     text        NOT NULL CHECK (location_type IN ('tower','floor','zone','chainage_stretch','pier','span','area','unit','system','line','node')),
  chainage_from     numeric(12,3),
  chainage_to       numeric(12,3),
  side              text        CHECK (side IS NULL OR side IN ('LHS','RHS','CENTRE')),
  level_label       text,
  sequence_no       integer     NOT NULL DEFAULT 0 CHECK (sequence_no >= 0),
  geometry_ref      text,
  created_by        text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_locations_code_unique UNIQUE (tenant_id, project_id, code),
  CONSTRAINT org_locations_chainage CHECK (chainage_from IS NULL OR chainage_to IS NULL OR chainage_to >= chainage_from),
  CONSTRAINT org_locations_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX org_locations_tree ON org_locations (tenant_id, project_id, parent_id);
SELECT sys.enable_tenant_rls('org_locations'::regclass);

CREATE TABLE org_site_geofences (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  site_id           bigint      NOT NULL REFERENCES org_sites (id),
  version_no        integer     NOT NULL CHECK (version_no >= 1),
  shape             text        NOT NULL CHECK (shape IN ('circle','polygon')),
  centre_latitude   numeric(9,6),
  centre_longitude  numeric(9,6),
  radius_m          integer     CHECK (radius_m IS NULL OR radius_m BETWEEN 20 AND 5000),
  polygon           jsonb,
  accuracy_tolerance_m integer  NOT NULL DEFAULT 20 CHECK (accuracy_tolerance_m BETWEEN 0 AND 500),
  valid_from        timestamptz NOT NULL,
  valid_to          timestamptz,
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_by        text        NOT NULL,
  approved_by       text,
  change_reason     text        NOT NULL CHECK (length(change_reason) >= 10),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_site_geofences_version_unique UNIQUE (tenant_id, site_id, version_no),
  CONSTRAINT org_site_geofences_shape CHECK (
    (shape = 'circle' AND centre_latitude IS NOT NULL AND centre_longitude IS NOT NULL AND radius_m IS NOT NULL AND polygon IS NULL)
    OR (shape = 'polygon' AND polygon IS NOT NULL AND centre_latitude IS NULL AND centre_longitude IS NULL AND radius_m IS NULL)
  ),
  CONSTRAINT org_site_geofences_valid CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT org_site_geofences_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT org_site_geofences_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('org_site_geofences'::regclass);

CREATE TABLE org_project_allocations (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL CHECK (length(user_ref) BETWEEN 1 AND 100),
  project_id        bigint      NOT NULL REFERENCES org_projects (id),
  site_id           bigint      REFERENCES org_sites (id),
  role_on_project   text        NOT NULL CHECK (length(role_on_project) BETWEEN 2 AND 60),
  valid_from        date        NOT NULL,
  valid_to          date,
  allocation_pct    numeric(5,2) NOT NULL CHECK (allocation_pct > 0 AND allocation_pct <= 200),
  reason            text        NOT NULL CHECK (length(reason) >= 10),
  created_by        text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_allocations_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX org_allocations_user ON org_project_allocations (tenant_id, user_ref, valid_from);
SELECT sys.enable_tenant_rls('org_project_allocations'::regclass);

-- Per-user context: pinned and recent project and site choices (REQ-ORG-F09).
CREATE TABLE org_user_contexts (
  tenant_id         uuid        NOT NULL,
  user_ref          text        NOT NULL,
  pinned            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  recent            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_ref)
);
SELECT sys.enable_tenant_rls('org_user_contexts'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON org_locations, org_site_geofences, org_project_allocations, org_user_contexts TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
