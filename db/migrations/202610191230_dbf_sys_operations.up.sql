-- Part 03 operational tables. Module: dbf. All technical; none holds business data.

-- Idempotency store (REQ-DBF-F06, AC-4). One row per (scope, key). A duplicate key with the same request hash returns the stored response.
CREATE TABLE sys.idempotency_keys (
  scope         text        NOT NULL CHECK (length(scope) BETWEEN 1 AND 200),
  idem_key      text        NOT NULL CHECK (length(idem_key) BETWEEN 8 AND 200),
  request_hash  text        NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status        text        NOT NULL CHECK (status IN ('pending', 'done')),
  response      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (scope, idem_key),
  CONSTRAINT idem_done_has_response CHECK (status = 'pending' OR response IS NOT NULL)
);
CREATE INDEX idempotency_keys_expiry ON sys.idempotency_keys (expires_at);

-- Transactional outbox (REQ-DBF-F06, AC-5). Written in the same transaction as the business change; relayed by Part 10.
CREATE TABLE sys.outbox (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  event_type    text        NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*\.[a-z_]+$'),
  schema_version integer    NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  tenant_id     uuid,
  payload       jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  attempts      integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error    text,
  CONSTRAINT outbox_published_after_created CHECK (published_at IS NULL OR published_at >= created_at)
);
CREATE INDEX outbox_unpublished ON sys.outbox (id) WHERE published_at IS NULL;

-- Back-fill batch checkpoints (REQ-DBF-F03). One row per batch; a resumed job starts after the last reconciled row.
CREATE TABLE sys.backfill_batches (
  job_code          text        NOT NULL CHECK (job_code ~ '^[a-z][a-z0-9_]*$'),
  module_code       text        NOT NULL CHECK (module_code ~ '^[a-z][a-z0-9]*$'),
  batch_no          integer     NOT NULL CHECK (batch_no >= 1),
  from_key          bigint      NOT NULL,
  to_key            bigint      NOT NULL CHECK (to_key >= from_key),
  rows_read         integer     NOT NULL DEFAULT 0 CHECK (rows_read >= 0),
  rows_written      integer     NOT NULL DEFAULT 0 CHECK (rows_written >= 0),
  checksum_source   text,
  checksum_target   text,
  status            text        NOT NULL CHECK (status IN ('running', 'reconciled', 'failed')),
  attempts          integer     NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  last_error        text,
  finished_at       timestamptz,
  PRIMARY KEY (job_code, batch_no),
  CONSTRAINT backfill_reconciled_has_checksums CHECK (status <> 'reconciled' OR (checksum_source IS NOT NULL AND checksum_source = checksum_target))
);

-- Integrity invariants registered by modules (REQ-DBF-F05). The SQL returns one row per violation.
CREATE TABLE sys.integrity_invariants (
  code          text        PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  module_code   text        NOT NULL CHECK (module_code ~ '^[a-z][a-z0-9]*$'),
  description   text        NOT NULL CHECK (length(description) >= 10),
  sql_text      text        NOT NULL,
  severity      text        NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  active        boolean     NOT NULL DEFAULT true
);

-- Integrity snapshots: row counts and checksums (append-only).
CREATE TABLE sys.integrity_snapshots (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope         text        NOT NULL,
  table_name    text        NOT NULL,
  row_count     bigint      NOT NULL CHECK (row_count >= 0),
  checksum      text        NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  sampled       boolean     NOT NULL DEFAULT false,
  trigger_name  text        NOT NULL,
  taken_at      timestamptz NOT NULL DEFAULT now()
);
SELECT sys.enforce_append_only('sys.integrity_snapshots'::regclass);

-- Integrity findings. Reported to the owning module; never corrected automatically.
CREATE TABLE sys.integrity_findings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invariant_code text       NOT NULL REFERENCES sys.integrity_invariants (code),
  severity      text        NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  key_ref       text        NOT NULL,
  detail        text,
  status        text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  owner_module  text        NOT NULL CHECK (owner_module ~ '^[a-z][a-z0-9]*$'),
  detected_at   timestamptz NOT NULL DEFAULT now(),
  resolved_ref  text,
  CONSTRAINT finding_resolved_has_ref CHECK (status <> 'resolved' OR resolved_ref IS NOT NULL)
);
CREATE INDEX integrity_findings_open ON sys.integrity_findings (status, severity);

-- ACP runs (REQ-DBF-F04): one governed replacement, tracked step by step.
CREATE TABLE sys.acp_runs (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adr_no          text        NOT NULL CHECK (adr_no ~ '^ADR-[0-9]{3}$'),
  component       text        NOT NULL CHECK (length(component) BETWEEN 3 AND 200),
  step            text        NOT NULL CHECK (step IN ('adr', 'expand', 'migrate', 'parallel_run', 'cut_over', 'contract')),
  status          text        NOT NULL CHECK (status IN ('adr_approved', 'expanded', 'migrating', 'parallel_run', 'cutover_ready', 'cut_over', 'stability_window', 'contracted', 'rolled_back')),
  evidence_refs   text[]      NOT NULL DEFAULT '{}',
  approved_by    text[]      NOT NULL DEFAULT '{}',
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  rollback_ref   text
);

-- ACP difference report rows (append-only). Zero unexplained rows is the parallel-run exit criterion.
CREATE TABLE sys.acp_diffs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  acp_run_id    bigint      NOT NULL REFERENCES sys.acp_runs (id),
  check_code    text        NOT NULL,
  old_value     text,
  new_value     text,
  explained_by  text,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);
SELECT sys.enforce_append_only('sys.acp_diffs'::regclass);

-- Legacy loads (REQ-DBF-F11). Counts only; the staged rows live in the load's own staging schema.
CREATE TABLE sys.legacy_loads (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  load_code         text        NOT NULL UNIQUE CHECK (load_code ~ '^[a-z][a-z0-9_]*$'),
  source_name       text        NOT NULL,
  target_table      text        NOT NULL,
  mapping_version   integer     NOT NULL CHECK (mapping_version >= 1),
  staged_rows       bigint      NOT NULL DEFAULT 0 CHECK (staged_rows >= 0),
  valid_rows        bigint      NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  rejected_rows     bigint      NOT NULL DEFAULT 0 CHECK (rejected_rows >= 0),
  status            text        NOT NULL CHECK (status IN ('mapped', 'staged', 'validated', 'reconciled', 'owner_signed_off', 'loaded', 'verified')),
  reconciliation_ref text,
  signed_off_by     text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_rows_add_up CHECK (valid_rows + rejected_rows <= staged_rows),
  CONSTRAINT legacy_signed_has_reconciliation CHECK (status NOT IN ('owner_signed_off', 'loaded', 'verified') OR (reconciliation_ref IS NOT NULL AND signed_off_by IS NOT NULL))
);

-- Effective dating (REQ-DBF-F07). A row is effective at a moment when valid_from <= at < valid_to (valid_to NULL = open).
CREATE OR REPLACE FUNCTION sys.is_effective(valid_from timestamptz, valid_to timestamptz, at timestamptz)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT valid_from <= at AND (valid_to IS NULL OR at < valid_to)
$$;

-- Grants for the application role (REQ-DBF-F15). Integrity and ACP tables are for the technical console and the migrator only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON sys.idempotency_keys, sys.outbox TO erp_app;
    GRANT USAGE ON SEQUENCE sys.outbox_id_seq TO erp_app;
    GRANT EXECUTE ON FUNCTION sys.is_effective(timestamptz, timestamptz, timestamptz) TO erp_app;
  END IF;
END $$;
