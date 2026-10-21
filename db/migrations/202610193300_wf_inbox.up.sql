-- Part 16 slice S4: workflow comments (module wf). Tenant-scoped with RLS. A comment never changes the state, so it does not use the
-- instance's version sequence and cannot make another person's approval stale.
CREATE TABLE wf_comments (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  instance_id bigint      NOT NULL REFERENCES wf_instances (id),
  author      text        NOT NULL,
  body        text        NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wf_comments_instance ON wf_comments (tenant_id, instance_id, created_at);
SELECT sys.enable_tenant_rls('wf_comments'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT ON wf_comments TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
