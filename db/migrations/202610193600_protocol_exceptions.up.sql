-- Part 17 slice S2: exceptions, their consumptions, and configuration items (thresholds, evidence rules, reason codes, exception matrix)
-- (module protocol). Tenant-scoped with RLS. Consumptions are append-only. Configuration is versioned and maker-checker (CP-PROTOCOL-03).
CREATE TABLE protocol_exceptions (
  id                bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         uuid        NOT NULL,
  exception_type    text        NOT NULL CHECK (exception_type IN ('QTY_OVER_PLAN', 'BUDGET_OVERRUN', 'SCHEDULE_DEVIATION', 'SPEC_DEVIATION', 'PROCESS_DEVIATION', 'EXCESS_CONSUMPTION', 'EMERGENCY_PURCHASE', 'SINGLE_SOURCE', 'NON_L1_SELECTION', 'BACK_DATED_ENTRY', 'CANCELLATION', 'REVERSAL', 'MODIFICATION_AFTER_APPROVAL', 'UNPLANNED_WORK', 'OVERTIME_EXCESS', 'IDLE_RESOURCE_RETENTION', 'DOCUMENT_WAIVER', 'RATE_ABOVE_BENCHMARK', 'CREDIT_LIMIT', 'PAYMENT_PRIORITY_OVERRIDE')),
  cp_code           text,
  reference         text        NOT NULL CHECK (length(reference) BETWEEN 1 AND 120),
  requested_by      text        NOT NULL,
  requested_value   numeric(18,4) NOT NULL CHECK (requested_value >= 0),
  approved_cap      numeric(18,4) CHECK (approved_cap IS NULL OR approved_cap >= 0),
  unit              text        NOT NULL CHECK (length(unit) BETWEEN 1 AND 20),
  variance_pct      numeric(9,4),
  amount_paise      bigint      CHECK (amount_paise IS NULL OR amount_paise >= 0),
  reason_code       text        NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 60),
  narrative         text        NOT NULL CHECK (length(narrative) >= 20),
  validity_kind     text        NOT NULL CHECK (validity_kind IN ('SINGLE_USE', 'UNTIL_DATE', 'QUANTITY_CAP')),
  valid_until       date,
  approval_band     text        CHECK (approval_band IN ('PM', 'PM_COST', 'MANAGEMENT')),
  status            text        NOT NULL CHECK (status IN ('REQUESTED', 'IN_APPROVAL', 'APPROVED', 'CONSUMED', 'EXPIRED', 'REJECTED', 'REVOKED', 'EMERGENCY')),
  approved_by       text,
  approved_at       timestamptz,
  consumed_total    numeric(18,4) NOT NULL DEFAULT 0 CHECK (consumed_total >= 0),
  emergency         boolean     NOT NULL DEFAULT false,
  emergency_due_at  timestamptz,
  regularised_at    timestamptz,
  regularised_by    text,
  evidence          jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CHECK (status NOT IN ('APPROVED', 'CONSUMED') OR approved_by IS NOT NULL OR emergency),
  CHECK (NOT emergency OR emergency_due_at IS NOT NULL),
  CHECK (regularised_by IS NULL OR regularised_by <> requested_by)
);
CREATE INDEX protocol_exceptions_open ON protocol_exceptions (tenant_id, status);
SELECT sys.enable_tenant_rls('protocol_exceptions'::regclass);

CREATE TABLE protocol_exception_consumptions (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  exception_id    bigint      NOT NULL REFERENCES protocol_exceptions (id),
  quantity        numeric(18,4) NOT NULL CHECK (quantity > 0),
  consumed_by     text        NOT NULL,
  transaction_ref text        NOT NULL CHECK (length(transaction_ref) BETWEEN 1 AND 120),
  consumed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX protocol_exception_consumptions_exc ON protocol_exception_consumptions (tenant_id, exception_id);
SELECT sys.enable_tenant_rls('protocol_exception_consumptions'::regclass);

-- Versioned configuration: thresholds, evidence rules, reason codes and the exception matrix. The body is checked by the code for its kind.
CREATE TABLE protocol_config_items (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid        NOT NULL,
  kind            text        NOT NULL CHECK (kind IN ('THRESHOLD', 'EVIDENCE_RULE', 'REASON_CODE', 'EXCEPTION_MATRIX')),
  item_key        text        NOT NULL CHECK (length(item_key) BETWEEN 2 AND 120),
  version         integer     NOT NULL CHECK (version >= 1),
  status          text        NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  body            jsonb       NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  effective_from  date        NOT NULL DEFAULT CURRENT_DATE,
  effective_to    date,
  created_by      text        NOT NULL,
  activated_by    text,
  activated_at    timestamptz,
  UNIQUE (tenant_id, kind, item_key, version),
  CHECK (activated_by IS NULL OR activated_by <> created_by),
  CHECK (status <> 'active' OR activated_by IS NOT NULL)
);
CREATE UNIQUE INDEX protocol_config_items_one_active ON protocol_config_items (tenant_id, kind, item_key, COALESCE(body->>'scopeKey', '')) WHERE status = 'active';
SELECT sys.enable_tenant_rls('protocol_config_items'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON protocol_exceptions, protocol_config_items TO erp_app;
    GRANT SELECT, INSERT ON protocol_exception_consumptions TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
