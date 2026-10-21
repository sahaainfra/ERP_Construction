// Global filters (Part 13 REQ-DASH-F05). Project, site, period and WBS travel in the URL, so a view can be shared. Parsing is pure. The
// server then checks that a project or site is one the viewer is allocated to: a filter can narrow what a viewer sees, never widen it.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { allocatedScopes } from "../org/allocations";

export interface DashFilters {
  projectId: number | null;
  siteId: number | null;
  period: string | null;
  wbs: string | null;
}

export const NO_FILTERS: DashFilters = { projectId: null, siteId: null, period: null, wbs: null };

export interface FilterProblem {
  field: string;
  message: string;
}

/** Reads filters from URL parameters. Anything malformed is reported, not guessed. */
export function parseFilters(input: Record<string, string | undefined>): { filters: DashFilters; problems: FilterProblem[] } {
  const problems: FilterProblem[] = [];
  const id = (name: "project" | "site"): number | null => {
    const raw = input[name];
    if (raw === undefined || raw === "") return null;
    if (!/^[1-9][0-9]{0,11}$/.test(raw)) {
      problems.push({ field: name, message: "not a valid identifier" });
      return null;
    }
    return Number(raw);
  };
  const projectId = id("project");
  const siteId = id("site");
  let period: string | null = null;
  if (input.period) {
    const m = /^(\d{4})-(\d{2})$/.exec(input.period);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) problems.push({ field: "period", message: "a month, for example 2026-10" });
    else period = input.period;
  }
  let wbs: string | null = null;
  if (input.wbs) {
    if (/^[A-Za-z0-9][A-Za-z0-9.-]{0,39}$/.test(input.wbs)) wbs = input.wbs;
    else problems.push({ field: "wbs", message: "letters, digits, dots and hyphens" });
  }
  if (siteId !== null && projectId === null) problems.push({ field: "site", message: "a site needs its project" });
  return { filters: { projectId, siteId, period, wbs }, problems };
}

/** The URL query for a set of filters. Empty filters give an empty string. */
export function filtersToQuery(f: DashFilters): string {
  const params = new URLSearchParams();
  if (f.projectId !== null) params.set("project", String(f.projectId));
  if (f.siteId !== null) params.set("site", String(f.siteId));
  if (f.period !== null) params.set("period", f.period);
  if (f.wbs !== null) params.set("wbs", f.wbs);
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

/** Checks the filters against the viewer's allocations today. A project or site outside them is refused. */
export async function resolveFilters(pool: Pool, ctx: RequestContext, f: DashFilters, asOf: Date = new Date()): Promise<{ filters: DashFilters; problems: FilterProblem[] }> {
  if (f.projectId === null) return { filters: f, problems: [] };
  const scopes = await allocatedScopes(pool, ctx, ctx.userId, asOf.toISOString().slice(0, 10));
  const problems: FilterProblem[] = [];
  const project = scopes.filter((s) => s.projectId === f.projectId);
  if (project.length === 0) problems.push({ field: "project", message: "not a project you are allocated to" });
  else if (f.siteId !== null && !project.some((s) => s.siteId === f.siteId)) problems.push({ field: "site", message: "not a site you are allocated to" });
  return problems.length > 0 ? { filters: { ...f, projectId: null, siteId: null }, problems } : { filters: f, problems: [] };
}
