-- Part 10 slice S1: event envelope fields on the outbox and the consumer inbox (REQ-EVBUS-F01, F02, F03). Additive only.
-- Existing rows keep NULL in the new columns; the envelope builder then uses the event id as the aggregate key.

ALTER TABLE sys.outbox
  ADD COLUMN aggregate_key text,
  ADD COLUMN correlation_id text,
  ADD COLUMN causation_id   text;

-- One row per (consumer, event) once the consumer has applied the event. Written in the same transaction as the business effect,
-- so a redelivered event is recognised and skipped (exactly-once business effect, AC-5).
CREATE TABLE evt_inbox (
  tenant_id     uuid        NOT NULL,
  consumer      text        NOT NULL CHECK (consumer ~ '^[a-z][a-z0-9_]*$'),
  event_id      uuid        NOT NULL,
  event_type    text        NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, consumer, event_id)
);
SELECT sys.enable_tenant_rls('evt_inbox'::regclass);
SELECT sys.enforce_append_only('evt_inbox'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT ON evt_inbox TO erp_app;
  END IF;
END
$$;
