-- Part 13 slice S3: search index, synonyms, zero-result analytics, recent and favourite items (module dash). Tenant-scoped with RLS.
-- The index holds only the searchable text and access tags. Personal fields (contacts, bank details, salaries) are never indexed (A-96).
CREATE TABLE srch_documents (
  tenant_id       uuid        NOT NULL,
  entity_type     text        NOT NULL CHECK (entity_type IN ('project', 'site', 'person')),
  entity_id       text        NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 80),
  title           text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  subtitle        text        NOT NULL DEFAULT '' CHECK (length(subtitle) <= 300),
  route           text        NOT NULL CHECK (route LIKE '/%'),
  project_id      bigint,
  site_id         bigint,
  confidentiality text        NOT NULL DEFAULT 'general' CHECK (confidentiality IN ('general', 'confidential', 'restricted', 'secure')),
  doc             tsvector    NOT NULL,
  indexed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, entity_type, entity_id)
);
CREATE INDEX srch_documents_doc ON srch_documents USING GIN (doc);
CREATE INDEX srch_documents_project ON srch_documents (tenant_id, project_id);
SELECT sys.enable_tenant_rls('srch_documents'::regclass);

-- Synonyms are used only once approved by the owner (A-97).
CREATE TABLE srch_synonyms (
  tenant_id   uuid        NOT NULL,
  term        text        NOT NULL CHECK (length(term) BETWEEN 2 AND 60),
  expansion   text        NOT NULL CHECK (length(expansion) BETWEEN 2 AND 60),
  status      text        NOT NULL CHECK (status IN ('proposed', 'approved')),
  PRIMARY KEY (tenant_id, term, expansion)
);
SELECT sys.enable_tenant_rls('srch_synonyms'::regclass);

-- Zero-result queries only, truncated, without the person who searched (privacy: A-109).
CREATE TABLE srch_zero_results (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  query_text  text        NOT NULL CHECK (length(query_text) BETWEEN 1 AND 100),
  scope       text        NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
SELECT sys.enable_tenant_rls('srch_zero_results'::regclass);

-- Recent items (last 50 per user) and favourites, as references to records the user opened.
CREATE TABLE usr_recent (
  tenant_id    uuid        NOT NULL,
  user_id      text        NOT NULL CHECK (length(user_id) BETWEEN 1 AND 80),
  entity_type  text        NOT NULL CHECK (entity_type IN ('project', 'site', 'person')),
  entity_id    text        NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 80),
  title        text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  route        text        NOT NULL CHECK (route LIKE '/%'),
  opened_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, entity_type, entity_id)
);
CREATE INDEX usr_recent_order ON usr_recent (tenant_id, user_id, opened_at DESC);
SELECT sys.enable_tenant_rls('usr_recent'::regclass);

CREATE TABLE usr_favourites (
  tenant_id    uuid        NOT NULL,
  user_id      text        NOT NULL CHECK (length(user_id) BETWEEN 1 AND 80),
  entity_type  text        NOT NULL CHECK (entity_type IN ('project', 'site', 'person')),
  entity_id    text        NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 80),
  title        text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  route        text        NOT NULL CHECK (route LIKE '/%'),
  added_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, entity_type, entity_id)
);
SELECT sys.enable_tenant_rls('usr_favourites'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON srch_documents, srch_synonyms, usr_recent, usr_favourites TO erp_app;
    GRANT SELECT, INSERT, DELETE ON usr_recent, usr_favourites TO erp_app;
    GRANT SELECT, INSERT ON srch_zero_results TO erp_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  END IF;
END
$$;
