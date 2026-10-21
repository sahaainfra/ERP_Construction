// Drill registry, hierarchy and where-used (Part 13 REQ-DASH-F11, F12, F13; CP-DASH-03; A-99). Every aggregate declares the dimensions
// it can be drilled by, and the route that a drill reaches. The same registry serves widgets, reports, search and trace.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { allocatedScopes } from "../org/allocations";
import { can } from "../iam/pdp";
import { withTransaction } from "../db/transactions";
import { WIDGETS } from "./widgets";

/** Route templates a drill may reach. A widget's drill route must be one of these (conformance test). */
export const DRILL_TARGETS = ["/projects", "/projects/{project}", "/projects/{project}/sites/{site}", "/people/{user}", "/security/events", "/account/sign-ins"] as const;

export interface DrillEntry {
  metricCode: string;
  dimensions: readonly string[];
  routeTemplate: (typeof DRILL_TARGETS)[number];
}

/** Built from the widgets, so a metric cannot be shown without its drill entry. */
export const DRILL_REGISTRY: DrillEntry[] = WIDGETS.map((w) => ({
  metricCode: w.metricCode,
  dimensions: (w.drillRoute.match(/\{(\w+)\}/g) ?? []).map((p) => p.slice(1, -1)),
  routeTemplate: w.drillRoute as (typeof DRILL_TARGETS)[number],
}));

/** Fills a route template with the given dimensions. Refuses a missing dimension rather than producing a broken link. */
export function resolveDrill(metricCode: string, dims: Record<string, string>, registry: readonly DrillEntry[] = DRILL_REGISTRY): { route: string } | { error: string } {
  const entry = registry.find((e) => e.metricCode === metricCode);
  if (!entry) return { error: "this figure has no drill path" };
  let route: string = entry.routeTemplate;
  for (const dim of entry.dimensions) {
    const value = dims[dim];
    if (!value || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) return { error: `a ${dim} is needed to open this figure` };
    route = route.replace(`{${dim}}`, value);
  }
  return { route };
}

/** Conformance (CP-DASH-03): every widget's metric has a drill entry, and the entry reaches a registered target. */
export function drillConformanceProblems(registry: readonly DrillEntry[] = DRILL_REGISTRY): string[] {
  const problems: string[] = [];
  for (const w of WIDGETS) {
    const entry = registry.find((e) => e.metricCode === w.metricCode);
    if (!entry) problems.push(`${w.code}: metric ${w.metricCode} has no drill entry`);
    else if (!(DRILL_TARGETS as readonly string[]).includes(entry.routeTemplate)) problems.push(`${w.code}: drill route ${entry.routeTemplate} is not a registered target`);
  }
  return problems;
}

export interface Crumb {
  label: string;
  route: string | null;
  built: boolean;
}

/**
 * Hierarchy breadcrumb (REQ-DASH-F12): Company → Project → Site → WBS → Activity → BOQ. Levels not built yet are shown as not built,
 * with no link, so nobody follows a link to a page that does not exist.
 */
export function breadcrumbs(path: { company?: string; project?: { id: string; code: string }; site?: { id: string; code: string }; wbs?: string; activity?: string; boq?: string }): Crumb[] {
  const crumbs: Crumb[] = [];
  if (path.company) crumbs.push({ label: path.company, route: null, built: false });
  if (path.project) crumbs.push({ label: path.project.code, route: `/projects/${path.project.id}`, built: true });
  if (path.site && path.project) crumbs.push({ label: path.site.code, route: `/projects/${path.project.id}/sites/${path.site.id}`, built: true });
  if (path.wbs) crumbs.push({ label: path.wbs, route: null, built: false });
  if (path.activity) crumbs.push({ label: path.activity, route: null, built: false });
  if (path.boq) crumbs.push({ label: path.boq, route: null, built: false });
  return crumbs;
}

export interface WhereUsedSection {
  label: string;
  count: number;
  route: string | null;
}

/**
 * Where-used links on a master (REQ-DASH-F13). Only sections that have something to show are returned. A project is shown only to a
 * viewer allocated to it (or with the scope permission); a person only to themselves or with the people permission.
 */
export async function whereUsed(pool: Pool, ctx: RequestContext, master: { type: "project"; id: string } | { type: "person"; id: string }, now: Date = new Date()): Promise<WhereUsedSection[]> {
  if (master.type === "project") {
    const all = await can(pool, ctx, "srch.scope.all");
    const scopes = all.allowed ? null : await allocatedScopes(pool, ctx, ctx.userId, now.toISOString().slice(0, 10));
    if (scopes && !scopes.some((s) => String(s.projectId) === master.id)) return [];
    // Counted inside the tenant's transaction, so row-level security applies to every count.
    const { rows } = await withTransaction(
      pool,
      (c) => c.query<{ sites: string; allocations: string }>(
        `SELECT (SELECT count(*) FROM org_sites s WHERE s.tenant_id = $1 AND s.project_id::text = $2) AS sites,
                (SELECT count(*) FROM org_project_allocations a WHERE a.tenant_id = $1 AND a.project_id::text = $2) AS allocations`,
        [ctx.tenantId, master.id],
      ),
      { tenantId: ctx.tenantId },
    );
    const sections: WhereUsedSection[] = [
      { label: "Sites", count: Number(rows[0].sites), route: `/projects/${master.id}` },
      { label: "People allocated", count: Number(rows[0].allocations), route: `/projects/${master.id}` },
    ];
    return sections.filter((s) => s.count > 0);
  }
  const self = master.id === ctx.userId;
  if (!self && !(await can(pool, ctx, "srch.people.view")).allowed) return [];
  const { rows } = await withTransaction(
    pool,
    (c) => c.query<{ allocations: string }>("SELECT count(*) AS allocations FROM org_project_allocations WHERE tenant_id = $1 AND user_ref = $2", [ctx.tenantId, master.id]),
    { tenantId: ctx.tenantId },
  );
  return [{ label: "Project allocations", count: Number(rows[0].allocations), route: `/people/${master.id}` }].filter((s) => s.count > 0);
}
