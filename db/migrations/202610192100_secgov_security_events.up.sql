-- Part 08 slice S2: login history and security events (module secgov). Append-only; the current status of an event is its latest
-- status row. Tenant-scoped with row-level security.

CREATE TABLE sec_login_history (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           uuid        NOT NULL,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  user_ref            text,
  outcome             text        NOT NULL CHECK (outcome IN ('success','failure','locked','mfa_failed','revoked','token_reuse')),
  device_hash         char(64)    CHECK (device_hash IS NULL OR device_hash ~ '^[0-9a-f]{64}$'),
  correlation_id      text
);
CREATE INDEX sec_login_history_user ON sec_login_history (tenant_id, user_ref, occurred_at);
CREATE INDEX sec_login_history_device ON sec_login_history (tenant_id, device_hash, occurred_at);
SELECT sys.enable_tenant_rls('sec_login_history'::regclass);
SELECT sys.enforce_append_only('sec_login_history'::regclass);

CREATE TABLE sec_security_events (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           uuid        NOT NULL,
  raised_at           timestamptz NOT NULL DEFAULT now(),
  rule_code           text        NOT NULL CHECK (rule_code ~ '^[A-Z][A-Z0-9_]{2,40}$'),
  severity            text        NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  subject_ref         text        NOT NULL CHECK (length(subject_ref) BETWEEN 1 AND 200),
  detail              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT sec_security_events_detail CHECK (jsonb_typeof(detail) = 'object')
);
CREATE INDEX sec_security_events_open ON sec_security_events (tenant_id, rule_code, subject_ref, raised_at);
SELECT sys.enable_tenant_rls('sec_security_events'::regclass);
SELECT sys.enforce_append_only('sec_security_events'::regclass);

-- Status history of an event: OPEN → ACKNOWLEDGED → RESOLVED | FALSE_POSITIVE. Append-only; the latest row is the status.
CREATE TABLE sec_security_event_status (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           uuid        NOT NULL,
  event_id            bigint      NOT NULL REFERENCES sec_security_events (id),
  status              text        NOT NULL CHECK (status IN ('open','acknowledged','resolved','false_positive')),
  changed_by          text        NOT NULL,
  reason              text,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sec_security_event_status_reason CHECK (status NOT IN ('resolved','false_positive') OR (reason IS NOT NULL AND length(reason) >= 10))
);
CREATE INDEX sec_security_event_status_event ON sec_security_event_status (tenant_id, event_id, changed_at DESC);
SELECT sys.enable_tenant_rls('sec_security_event_status'::regclass);
SELECT sys.enforce_append_only('sec_security_event_status'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT ON sec_login_history, sec_security_events, sec_security_event_status TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
