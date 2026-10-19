-- Part 05 shared kernel. Module: core. Every table is tenant-scoped with row-level security (ADR-002).
-- Adapter tables (core_audit_entries, core_action_ledger, core_protocol_evaluations) are the interim stores that the
-- unit of work writes to. Part 08 (audit) and Part 17 (protocol) replace them behind the same interface (see DB_EXTENSIONS.md).

-- Configuration values: append-only versions. The effective value at a moment is the latest row with valid_from <= moment.
CREATE TABLE core_settings (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  scope_type      text        NOT NULL CHECK (scope_type IN ('tenant','company','legal_entity','branch','project','site','user')),
  scope_id        text        NOT NULL CHECK (length(scope_id) BETWEEN 1 AND 200),
  setting_key     text        NOT NULL CHECK (setting_key ~ '^[a-z][a-z0-9_.]*$'),
  value_json      jsonb       NOT NULL,
  valid_from      timestamptz NOT NULL DEFAULT now(),
  changed_by      text        NOT NULL,
  change_reason   text        NOT NULL CHECK (length(change_reason) >= 10),
  approved_by     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT core_settings_maker_checker CHECK (approved_by IS NULL OR approved_by <> changed_by)
);
CREATE INDEX core_settings_lookup ON core_settings (tenant_id, setting_key, scope_type, scope_id, valid_from DESC);
SELECT sys.enable_tenant_rls('core_settings'::regclass);
SELECT sys.enforce_append_only('core_settings'::regclass);

-- Number series and allocations (AC-6). The series row is locked while a number is allocated.
CREATE TABLE core_number_series (
  tenant_id       uuid        NOT NULL,
  series_code     text        NOT NULL CHECK (series_code ~ '^[A-Z][A-Z0-9_-]{1,39}$'),
  template        text        NOT NULL CHECK (template LIKE '%{SEQ%'),
  next_value      bigint      NOT NULL DEFAULT 1 CHECK (next_value >= 1),
  is_gapless      boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, series_code)
);
SELECT sys.enable_tenant_rls('core_number_series'::regclass);

CREATE TABLE core_number_allocations (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  series_code     text        NOT NULL,
  seq             bigint      NOT NULL CHECK (seq >= 1),
  formatted       text        NOT NULL,
  doc_ref         text        NOT NULL CHECK (length(doc_ref) BETWEEN 1 AND 200),
  status          text        NOT NULL DEFAULT 'allocated' CHECK (status IN ('allocated','used','voided')),
  void_reason     text,
  allocated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT core_number_allocations_unique UNIQUE (tenant_id, series_code, seq),
  CONSTRAINT core_number_allocations_void_reason CHECK (status <> 'voided' OR (void_reason IS NOT NULL AND length(void_reason) >= 10)),
  FOREIGN KEY (tenant_id, series_code) REFERENCES core_number_series (tenant_id, series_code)
);
SELECT sys.enable_tenant_rls('core_number_allocations'::regclass);

-- Interim adapter tables (append-only). Written by the unit of work in the same transaction as the business change.
CREATE TABLE core_audit_entries (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  actor_id        text        NOT NULL,
  action          text        NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.]*$'),
  entity_type     text        NOT NULL,
  entity_id       text        NOT NULL,
  correlation_id  text        NOT NULL,
  detail          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
SELECT sys.enable_tenant_rls('core_audit_entries'::regclass);
SELECT sys.enforce_append_only('core_audit_entries'::regclass);

CREATE TABLE core_action_ledger (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  actor_id        text        NOT NULL,
  lifecycle_action text       NOT NULL CHECK (lifecycle_action IN ('CREATED','SUBMITTED','VERIFIED','REVIEWED','APPROVED','REJECTED','RETURNED','MODIFIED','EXECUTED','RECORDED','RECONCILED','CLOSED','CANCELLED','REVERSED')),
  entity_type     text        NOT NULL,
  entity_id       text        NOT NULL,
  reason          text,
  correlation_id  text        NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
SELECT sys.enable_tenant_rls('core_action_ledger'::regclass);
SELECT sys.enforce_append_only('core_action_ledger'::regclass);

CREATE TABLE core_protocol_evaluations (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  cp_code         text        NOT NULL CHECK (cp_code ~ '^CP-[A-Z]+-[0-9]{2}$'),
  result          text        NOT NULL CHECK (result IN ('PASS','WARN','EXCEPTION_REQUIRED','BLOCK')),
  detail          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  correlation_id  text        NOT NULL,
  evaluated_at    timestamptz NOT NULL DEFAULT now()
);
SELECT sys.enable_tenant_rls('core_protocol_evaluations'::regclass);
SELECT sys.enforce_append_only('core_protocol_evaluations'::regclass);

-- Background jobs (REQ-CORE-F14). Claimed with SKIP LOCKED per tenant; retries with backoff; dead after max_attempts.
CREATE TABLE core_jobs (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  job_type        text        NOT NULL CHECK (job_type ~ '^[a-z][a-z0-9_.]*$'),
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status          text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','dead')),
  attempts        integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts    integer     NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  run_after       timestamptz NOT NULL DEFAULT now(),
  idempotency_key text        NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  locked_until    timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  CONSTRAINT core_jobs_idempotent UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX core_jobs_claim ON core_jobs (tenant_id, status, run_after);
SELECT sys.enable_tenant_rls('core_jobs'::regclass);

-- Holiday calendars by scope (REQ-CORE-F10). Effective-dated: a declaration applies from valid_from.
CREATE TABLE core_holidays (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  calendar_code   text        NOT NULL CHECK (calendar_code ~ '^[a-z][a-z0-9_-]{1,60}$'),
  holiday_date    date        NOT NULL,
  holiday_name    text        NOT NULL CHECK (length(holiday_name) BETWEEN 2 AND 200),
  holiday_type    text        NOT NULL CHECK (holiday_type IN ('national','state','local','project')),
  valid_from      timestamptz NOT NULL DEFAULT now(),
  declared_by     text        NOT NULL,
  CONSTRAINT core_holidays_unique UNIQUE (tenant_id, calendar_code, holiday_date)
);
SELECT sys.enable_tenant_rls('core_holidays'::regclass);

-- Financial periods (REQ-CORE-F10). Status is per calendar; closed periods are never changed in place.
CREATE TABLE core_financial_periods (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  fy_code         text        NOT NULL CHECK (fy_code ~ '^[0-9]{4}-[0-9]{2}$'),
  period_no       integer     NOT NULL CHECK (period_no BETWEEN 1 AND 13),
  starts_on       date        NOT NULL,
  ends_on         date        NOT NULL,
  status          text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','soft_closed','closed')),
  CONSTRAINT core_financial_periods_unique UNIQUE (tenant_id, fy_code, period_no),
  CONSTRAINT core_financial_periods_order CHECK (ends_on >= starts_on)
);
SELECT sys.enable_tenant_rls('core_financial_periods'::regclass);

-- Reference module (REQ-CORE-F17). Hidden behind ff.core.sample, default OFF in production.
CREATE TABLE core_sample_records (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  title           text        NOT NULL CHECK (length(title) BETWEEN 2 AND 200),
  amount_paise    bigint      NOT NULL CHECK (amount_paise >= 0),
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  number          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
SELECT sys.enable_tenant_rls('core_sample_records'::regclass);

-- Application role grants (REQ-DBF-F15). Append-only tables: INSERT and SELECT only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT ON core_settings, core_audit_entries, core_action_ledger, core_protocol_evaluations TO erp_app;
    GRANT SELECT, INSERT, UPDATE ON core_number_series, core_number_allocations, core_jobs, core_holidays, core_financial_periods, core_sample_records TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END $$;
