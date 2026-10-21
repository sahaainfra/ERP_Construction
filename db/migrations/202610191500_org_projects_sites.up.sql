-- Part 06 slice S2: project and site masters, lifecycle history and templates (module org). Tenant-scoped with row-level security.
-- Projects and sites are approved by a second person before use (CP-ORG-02). Lifecycle changes are append-only history.

-- Project templates: defaults copied into a project when it is created. Later template edits never change existing projects.
CREATE TABLE org_project_templates (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  template_code     text        NOT NULL CHECK (template_code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name              text        NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  project_type      text        NOT NULL CHECK (project_type IN ('building','road_highway','bridge_flyover','metro_rail','water_irrigation_pipeline','industrial_epc','power_transmission','real_estate_development','interiors_fit_out','other')),
  default_contract_mode text    CHECK (default_contract_mode IS NULL OR length(default_contract_mode) BETWEEN 2 AND 40),
  created_by        text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_project_templates_unique UNIQUE (tenant_id, template_code)
);
SELECT sys.enable_tenant_rls('org_project_templates'::regclass);

CREATE TABLE org_projects (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  code              text        NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,19}$'),
  name              text        NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  legal_entity_id   bigint      NOT NULL REFERENCES org_legal_entities (id),
  branch_unit_id    bigint      REFERENCES org_units (id),
  business_unit_id  bigint      REFERENCES org_units (id),
  project_type      text        NOT NULL CHECK (project_type IN ('building','road_highway','bridge_flyover','metro_rail','water_irrigation_pipeline','industrial_epc','power_transmission','real_estate_development','interiors_fit_out','other')),
  contract_mode     text        CHECK (contract_mode IS NULL OR length(contract_mode) BETWEEN 2 AND 40),
  template_code     text,
  client_party_ref  text        CHECK (client_party_ref IS NULL OR length(client_party_ref) BETWEEN 1 AND 100),
  state_code        char(2)     CHECK (state_code IS NULL OR state_code ~ '^(0[1-9]|[1-3][0-9])$'),
  district          text        CHECK (district IS NULL OR length(district) BETWEEN 2 AND 100),
  latitude          numeric(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude         numeric(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  planned_start     date,
  planned_finish    date,
  revised_finish    date,
  jv_flag           boolean     NOT NULL DEFAULT false,
  jv_partner_ref    text,
  project_director  text, project_manager text, planning_lead text, commercial_lead text,
  qs_lead           text, store_in_charge text, hse_lead text, qa_lead text,
  lifecycle_status  text        NOT NULL DEFAULT 'proposed' CHECK (lifecycle_status IN ('proposed','tendering','awarded','mobilisation','active','on_hold','substantially_complete','dlp','closed','archived')),
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_by        text        NOT NULL,
  approved_by       text,
  change_reason     text        NOT NULL CHECK (length(change_reason) >= 10),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_projects_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT org_projects_dates CHECK (planned_finish IS NULL OR planned_start IS NULL OR planned_finish >= planned_start),
  CONSTRAINT org_projects_revised CHECK (revised_finish IS NULL OR planned_start IS NULL OR revised_finish >= planned_start),
  CONSTRAINT org_projects_coordinates CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT org_projects_jv CHECK (jv_flag = false OR jv_partner_ref IS NOT NULL),
  CONSTRAINT org_projects_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT org_projects_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('org_projects'::regclass);

CREATE TABLE org_sites (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  code              text        NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,19}$'),
  name              text        NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  project_id        bigint      NOT NULL REFERENCES org_projects (id),
  site_type         text        NOT NULL CHECK (site_type IN ('main_site','casting_yard','batching_plant_site','crusher_site','labour_camp','store_yard','quarry_borrow_area','office')),
  address           text        CHECK (address IS NULL OR length(address) >= 5),
  state_code        char(2)     NOT NULL CHECK (state_code ~ '^(0[1-9]|[1-3][0-9])$'),
  latitude          numeric(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude         numeric(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  timezone          text        NOT NULL DEFAULT 'Asia/Kolkata' CHECK (length(timezone) BETWEEN 3 AND 60),
  site_manager      text,
  status            text        NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','mobilising','active','suspended','demobilising','closed')),
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_by        text        NOT NULL,
  approved_by       text,
  change_reason     text        NOT NULL CHECK (length(change_reason) >= 10),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_sites_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT org_sites_coordinates CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT org_sites_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT org_sites_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL)
);
CREATE INDEX org_sites_project ON org_sites (tenant_id, project_id);
SELECT sys.enable_tenant_rls('org_sites'::regclass);

-- Lifecycle history (append-only): every status change, with the reason and both people.
CREATE TABLE org_project_status_history (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  project_id        bigint      NOT NULL REFERENCES org_projects (id),
  from_status       text        NOT NULL,
  to_status         text        NOT NULL,
  reason            text        NOT NULL CHECK (length(reason) >= 10),
  exception_reason  text        CHECK (exception_reason IS NULL OR length(exception_reason) >= 20),
  changed_by        text        NOT NULL,
  approved_by       text        NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_project_status_history_maker_checker CHECK (approved_by <> changed_by)
);
SELECT sys.enable_tenant_rls('org_project_status_history'::regclass);
SELECT sys.enforce_append_only('org_project_status_history'::regclass);

-- A cost centre can now belong to a project (CP-ORG-01 checks it).
ALTER TABLE org_cost_centres ADD COLUMN project_id bigint REFERENCES org_projects (id);
CREATE INDEX org_cost_centres_project ON org_cost_centres (tenant_id, project_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON org_project_templates, org_projects, org_sites TO erp_app;
    GRANT SELECT, INSERT ON org_project_status_history TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
