-- Part 06 enterprise structure (module org). Every table is tenant-scoped with row-level security (ADR-002).
-- One hierarchy table (org_units) carries groups, companies, branches, offices, yards, plant depots, business units,
-- divisions and departments: they share the same lifecycle, approval and parent rules (decision D-042).
-- Nothing is deleted. Entities are deactivated, and a code cannot be reused. Changes to hierarchy are audited through core.

-- Legal entities: the registered companies that transact and pay tax.
CREATE TABLE org_legal_entities (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  code              text        NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,19}$'),
  legal_name        text        NOT NULL CHECK (length(legal_name) BETWEEN 2 AND 200),
  pan               text        NOT NULL CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  tan               text        CHECK (tan IS NULL OR tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'),
  cin_or_llpin      text        CHECK (cin_or_llpin IS NULL OR length(cin_or_llpin) BETWEEN 5 AND 30),
  registered_address text       NOT NULL CHECK (length(registered_address) >= 5),
  base_currency     char(3)     NOT NULL DEFAULT 'INR' CHECK (base_currency ~ '^[A-Z]{3}$'),
  udyam_status      text        NOT NULL DEFAULT 'none' CHECK (udyam_status IN ('none','micro','small','medium')),
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by        text        NOT NULL,
  approved_by       text,
  change_reason     text        NOT NULL CHECK (length(change_reason) >= 10),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_legal_entities_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT org_legal_entities_pan_unique UNIQUE (tenant_id, pan),
  CONSTRAINT org_legal_entities_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT org_legal_entities_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('org_legal_entities'::regclass);

-- Registrations: GSTIN per state, TAN, PF, ESIC, professional tax, LWF, BOCW, labour licence. Effective-dated.
CREATE TABLE org_legal_entity_registrations (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  legal_entity_id   bigint      NOT NULL REFERENCES org_legal_entities (id),
  registration_type text        NOT NULL CHECK (registration_type IN ('GSTIN','TAN','PF','ESIC','PT','LWF','BOCW','LABOUR_LICENCE')),
  state_code        char(2)     NOT NULL CHECK (state_code ~ '^(0[1-9]|[1-3][0-9])$'),
  number            text        NOT NULL CHECK (length(number) BETWEEN 5 AND 30),
  valid_from        date        NOT NULL,
  valid_to          date,
  document_ref      text,
  created_by        text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_registrations_dates CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT org_registrations_gstin_format CHECK (registration_type <> 'GSTIN' OR number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  CONSTRAINT org_registrations_unique UNIQUE (tenant_id, registration_type, number)
);
CREATE INDEX org_registrations_entity ON org_legal_entity_registrations (tenant_id, legal_entity_id);
SELECT sys.enable_tenant_rls('org_legal_entity_registrations'::regclass);

-- Hierarchy units. Parent rules are checked by the service (src/org/structure.ts), not by the database.
CREATE TABLE org_units (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  unit_type         text        NOT NULL CHECK (unit_type IN ('group','company','branch','office','yard','plant_depot','business_unit','division','department')),
  code              text        NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,19}$'),
  name              text        NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  parent_id         bigint      REFERENCES org_units (id),
  legal_entity_id   bigint      REFERENCES org_legal_entities (id),
  state_code        char(2)     CHECK (state_code IS NULL OR state_code ~ '^(0[1-9]|[1-3][0-9])$'),
  address           text        CHECK (address IS NULL OR length(address) >= 5),
  latitude          numeric(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude         numeric(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  head_name         text        CHECK (head_name IS NULL OR length(head_name) BETWEEN 2 AND 200),
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_by        text        NOT NULL,
  approved_by       text,
  change_reason     text        NOT NULL CHECK (length(change_reason) >= 10),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_units_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT org_units_company_entity CHECK (unit_type NOT IN ('company','branch') OR legal_entity_id IS NOT NULL),
  CONSTRAINT org_units_coordinates CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT org_units_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT org_units_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL),
  CONSTRAINT org_units_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX org_units_parent ON org_units (tenant_id, parent_id);
SELECT sys.enable_tenant_rls('org_units'::regclass);

-- History of hierarchy changes (append-only). Each reparent is effective-dated and never edited.
CREATE TABLE org_unit_history (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  unit_id           bigint      NOT NULL REFERENCES org_units (id),
  change_kind       text        NOT NULL CHECK (change_kind IN ('reparented','deactivated')),
  old_parent_id     bigint,
  new_parent_id     bigint,
  effective_from    date        NOT NULL,
  reason            text        NOT NULL CHECK (length(reason) >= 10),
  changed_by        text        NOT NULL,
  approved_by       text        NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_unit_history_maker_checker CHECK (approved_by <> changed_by)
);
SELECT sys.enable_tenant_rls('org_unit_history'::regclass);
SELECT sys.enforce_append_only('org_unit_history'::regclass);

-- Cost centres and profit centres. A centre may point at the unit it reports for.
CREATE TABLE org_cost_centres (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  code              text        NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,19}$'),
  name              text        NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  centre_type       text        NOT NULL CHECK (centre_type IN ('project','overhead','plant','production_unit','department')),
  parent_id         bigint      REFERENCES org_cost_centres (id),
  unit_id           bigint      REFERENCES org_units (id),
  valid_from        date        NOT NULL,
  valid_to          date,
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_by        text        NOT NULL,
  approved_by       text,
  change_reason     text        NOT NULL CHECK (length(change_reason) >= 10),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_cost_centres_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT org_cost_centres_dates CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT org_cost_centres_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT org_cost_centres_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('org_cost_centres'::regclass);

CREATE TABLE org_profit_centres (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  code              text        NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,19}$'),
  name              text        NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  parent_id         bigint      REFERENCES org_profit_centres (id),
  unit_id           bigint      REFERENCES org_units (id),
  valid_from        date        NOT NULL,
  valid_to          date,
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  approval_status   text        NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_by        text        NOT NULL,
  approved_by       text,
  change_reason     text        NOT NULL CHECK (length(change_reason) >= 10),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_profit_centres_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT org_profit_centres_dates CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT org_profit_centres_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by),
  CONSTRAINT org_profit_centres_approver CHECK (approval_status <> 'approved' OR approved_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('org_profit_centres'::regclass);

-- Application role: read, create and update. No delete: records are deactivated, never removed (Part 06 rules).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON org_legal_entities, org_legal_entity_registrations, org_units, org_cost_centres, org_profit_centres TO erp_app;
    GRANT SELECT, INSERT ON org_unit_history TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
