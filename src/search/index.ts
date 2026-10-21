// Search indexer (Part 13 REQ-DASH-F07; A-96, A-98). The index holds searchable text and access tags only. Personal fields (contacts,
// bank details, salaries, director and client names) are never read into it. A reconciliation rebuilds the index from the owning tables;
// event-driven updates use the same statements once the owning Parts emit their events.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { can } from "../iam/pdp";

export const SEARCH_PERMISSIONS = [
  { key: "srch.index.manage", module: "dash", description: "Rebuild the search index", stage: "APPROVE", sensitivity: "privileged" },
  { key: "srch.scope.all", module: "dash", description: "Search every project and site, not only those you are allocated to", stage: "APPROVE", sensitivity: "privileged" },
  { key: "srch.people.view", module: "dash", description: "Find people by name and User ID", stage: "MONITOR", sensitivity: "sensitive" },
  { key: "srch.confidential.view", module: "dash", description: "See confidential results", stage: "MONITOR", sensitivity: "sensitive" },
  { key: "srch.restricted.view", module: "dash", description: "See restricted results", stage: "MONITOR", sensitivity: "privileged" },
  { key: "srch.secure.view", module: "dash", description: "See secure results", stage: "APPROVE", sensitivity: "privileged" },
] as const;

/** Rebuilds the index for the tenant from the owning tables. Archived projects and deactivated users are removed from it. */
export async function reconcileIndex(pool: Pool, ctx: RequestContext): Promise<{ projects: number; sites: number; people: number }> {
  const allowed = await can(pool, ctx, "srch.index.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  return withTransaction(
    pool,
    async (c) => {
      const t = ctx.tenantId;
      const projects = await c.query(
        `INSERT INTO srch_documents (tenant_id, entity_type, entity_id, title, subtitle, route, project_id, site_id, confidentiality, doc, indexed_at)
         SELECT p.tenant_id, 'project', p.id::text, p.code || ' ' || p.name, p.project_type || ' · ' || p.lifecycle_status, '/projects/' || p.id, p.id, NULL, 'general',
                to_tsvector('simple', p.code || ' ' || p.name || ' ' || p.project_type), now()
           FROM org_projects p WHERE p.tenant_id = $1 AND p.lifecycle_status <> 'archived'
         ON CONFLICT (tenant_id, entity_type, entity_id) DO UPDATE SET title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, route = EXCLUDED.route, doc = EXCLUDED.doc, indexed_at = now()`,
        [t],
      );
      await c.query("DELETE FROM srch_documents WHERE tenant_id = $1 AND entity_type = 'project' AND entity_id NOT IN (SELECT id::text FROM org_projects WHERE tenant_id = $1 AND lifecycle_status <> 'archived')", [t]);
      const sites = await c.query(
        `INSERT INTO srch_documents (tenant_id, entity_type, entity_id, title, subtitle, route, project_id, site_id, confidentiality, doc, indexed_at)
         SELECT s.tenant_id, 'site', s.id::text, s.code || ' ' || s.name, s.site_type || ' · ' || s.status, '/projects/' || s.project_id || '/sites/' || s.id, s.project_id, s.id, 'general',
                to_tsvector('simple', s.code || ' ' || s.name || ' ' || s.site_type), now()
           FROM org_sites s JOIN org_projects p ON p.id = s.project_id AND p.tenant_id = s.tenant_id
          WHERE s.tenant_id = $1 AND p.lifecycle_status <> 'archived' AND s.status <> 'closed'
         ON CONFLICT (tenant_id, entity_type, entity_id) DO UPDATE SET title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, route = EXCLUDED.route, project_id = EXCLUDED.project_id, site_id = EXCLUDED.site_id, doc = EXCLUDED.doc, indexed_at = now()`,
        [t],
      );
      await c.query("DELETE FROM srch_documents WHERE tenant_id = $1 AND entity_type = 'site' AND entity_id NOT IN (SELECT s.id::text FROM org_sites s JOIN org_projects p ON p.id = s.project_id WHERE s.tenant_id = $1 AND p.lifecycle_status <> 'archived' AND s.status <> 'closed')", [t]);
      // People: name and User ID only. Contacts and any other personal field are not read.
      const people = await c.query(
        `INSERT INTO srch_documents (tenant_id, entity_type, entity_id, title, subtitle, route, project_id, site_id, confidentiality, doc, indexed_at)
         SELECT u.tenant_id, 'person', u.user_id, u.display_name, u.user_id || ' · ' || u.person_type, '/people/' || u.user_id, NULL, NULL, 'general',
                to_tsvector('simple', u.display_name || ' ' || u.user_id), now()
           FROM auth_users u WHERE u.tenant_id = $1 AND u.state IN ('active', 'pending_activation', 'suspended')
         ON CONFLICT (tenant_id, entity_type, entity_id) DO UPDATE SET title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, doc = EXCLUDED.doc, indexed_at = now()`,
        [t],
      );
      await c.query("DELETE FROM srch_documents WHERE tenant_id = $1 AND entity_type = 'person' AND entity_id NOT IN (SELECT user_id FROM auth_users WHERE tenant_id = $1 AND state IN ('active', 'pending_activation', 'suspended'))", [t]);
      return { projects: projects.rowCount ?? 0, sites: sites.rowCount ?? 0, people: people.rowCount ?? 0 };
    },
    { tenantId: ctx.tenantId },
  );
}
