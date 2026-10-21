-- Reverses 202610191500_org_projects_sites.up.sql. Drops only what this migration created.
ALTER TABLE org_cost_centres DROP COLUMN IF EXISTS project_id;
DROP TABLE IF EXISTS org_project_status_history;
DROP TABLE IF EXISTS org_sites;
DROP TABLE IF EXISTS org_projects;
DROP TABLE IF EXISTS org_project_templates;
