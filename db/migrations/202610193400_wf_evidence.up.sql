-- Part 16 slice S5: the context snapshot stored with each decision (CP-WF-05). Append-only: what the approver saw is never rewritten.
CREATE TABLE dec_context_snapshots (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    uuid        NOT NULL,
  instance_id  bigint      NOT NULL REFERENCES wf_instances (id),
  task_id      bigint      REFERENCES wf_tasks (id),
  action       text        NOT NULL CHECK (action IN ('approve', 'reject')),
  actor        text        NOT NULL,
  context_json jsonb       NOT NULL CHECK (jsonb_typeof(context_json) = 'object'),
  computed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dec_context_snapshots_instance ON dec_context_snapshots (tenant_id, instance_id);
SELECT sys.enable_tenant_rls('dec_context_snapshots'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT ON dec_context_snapshots TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
