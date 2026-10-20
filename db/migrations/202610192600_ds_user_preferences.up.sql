-- Part 12 slice S2: per-user display preferences (REQ-DS-F10; A-78). One row per user, changed only by that user.
-- Tenant-scoped with row-level security. Pinned routes are checked against the live navigation list by the service.
CREATE TABLE ui_user_preferences (
  tenant_id       uuid        NOT NULL,
  user_id         text        NOT NULL CHECK (length(user_id) BETWEEN 1 AND 80),
  theme           text        NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark', 'high-contrast')),
  density         text        NOT NULL DEFAULT 'cozy' CHECK (density IN ('compact', 'cozy', 'touch')),
  nav_collapsed   boolean     NOT NULL DEFAULT false,
  pinned          text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(pinned) <= 10),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
SELECT sys.enable_tenant_rls('ui_user_preferences'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ui_user_preferences TO erp_app;
  END IF;
END
$$;
