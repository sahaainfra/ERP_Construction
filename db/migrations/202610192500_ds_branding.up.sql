-- Part 12 slice S1: tenant branding (REQ-DS-F11; A-77). A version holds the two brand colours, the contrast report that was
-- checked before it was stored, and the approval. Versions are never edited; a new approval supersedes the active version.
CREATE TABLE ui_branding (
  tenant_id        uuid        NOT NULL,
  version          integer     NOT NULL CHECK (version >= 1),
  brand_primary    text        NOT NULL CHECK (brand_primary ~ '^#[0-9A-F]{6}$'),
  brand_accent     text        NOT NULL CHECK (brand_accent ~ '^#[0-9A-F]{6}$'),
  logo_ref         text        CHECK (logo_ref IS NULL OR logo_ref ~ '^[a-z0-9_-]{1,80}$'),
  status           text        NOT NULL CHECK (status IN ('proposed', 'active', 'superseded')),
  contrast_report  jsonb       NOT NULL,
  created_by       text        NOT NULL,
  approved_by      text,
  reason           text        NOT NULL CHECK (length(reason) >= 10),
  created_at       timestamptz NOT NULL DEFAULT now(),
  approved_at      timestamptz,
  PRIMARY KEY (tenant_id, version),
  CONSTRAINT ui_branding_approver CHECK (status = 'proposed' OR approved_by IS NOT NULL)
);
SELECT sys.enable_tenant_rls('ui_branding'::regclass);
CREATE UNIQUE INDEX ui_branding_one_active ON ui_branding (tenant_id) WHERE status = 'active';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ui_branding TO erp_app;
  END IF;
END
$$;
