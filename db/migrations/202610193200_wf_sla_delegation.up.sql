-- Part 16 slice S3: delegation, SLA timers, amendments and emergency approvals (module wf). Tenant-scoped with RLS.
-- Amendments link to the instance they amend and keep the changes (A-148). Emergency approvals carry a regularisation deadline (PC-3).
ALTER TABLE wf_instances ADD COLUMN amendment_of bigint REFERENCES wf_instances (id);
ALTER TABLE wf_instances ADD COLUMN change_summary jsonb CHECK (change_summary IS NULL OR jsonb_typeof(change_summary) = 'array');
ALTER TABLE wf_instances ADD COLUMN emergency boolean NOT NULL DEFAULT false;
ALTER TABLE wf_instances ADD COLUMN emergency_due_at timestamptz;
ALTER TABLE wf_instances ADD COLUMN regularised_at timestamptz;
ALTER TABLE wf_instances ADD COLUMN regularised_by text;
ALTER TABLE wf_instances ADD CONSTRAINT wf_instances_emergency_deadline CHECK (NOT emergency OR emergency_due_at IS NOT NULL);

-- SLA timers: the due time is set from the working calendar when the task is created. Reminders are sent once at each threshold.
ALTER TABLE wf_tasks ADD COLUMN due_at timestamptz;
ALTER TABLE wf_tasks ADD COLUMN reminded_50 boolean NOT NULL DEFAULT false;
ALTER TABLE wf_tasks ADD COLUMN reminded_90 boolean NOT NULL DEFAULT false;

-- The person an action was taken for, when a delegate acted (CP-WF-01 and §5 of the Part).
ALTER TABLE wf_action_log ADD COLUMN on_behalf_of text;

-- One hop: a delegate cannot pass the delegation on. A delegation is bounded by the delegator's limit at the time of each action.
CREATE TABLE wf_delegations (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  delegator   text        NOT NULL,
  delegate    text        NOT NULL,
  doc_type    text,
  valid_from  timestamptz NOT NULL,
  valid_to    timestamptz NOT NULL,
  reason      text        NOT NULL CHECK (length(reason) >= 10),
  created_by  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  CHECK (delegator <> delegate),
  CHECK (valid_to > valid_from)
);
CREATE INDEX wf_delegations_delegate ON wf_delegations (tenant_id, delegate);
SELECT sys.enable_tenant_rls('wf_delegations'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON wf_delegations TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
