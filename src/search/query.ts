// Search query service (Part 13 REQ-DASH-F08; CP-DASH-02; A-96, A-97). Permission is applied inside the query, so counts and facets are
// computed from the rows the viewer may see. Synonyms apply only once the owner has approved them.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { can } from "../iam/pdp";
import { allocatedScopes } from "../org/allocations";
import { LIVE_ROUTES } from "../design/navigation";

export type EntityType = "project" | "site" | "person";

/** Typed prefixes that name a type that is indexed now. Prefixes for modules not yet built answer "not indexed", not an empty success. */
export const PREFIXES: Record<string, EntityType> = { proj: "project", prj: "project", site: "site", emp: "person", user: "person" };
export const UNINDEXED_PREFIXES = ["po", "pr", "grn", "vendor", "boq", "drg", "rfi", "ncr", "wo", "plant"] as const;

/** Synonyms proposed from REQ-DASH-F08. They take effect only when approved (A-97). */
export const SYNONYM_SEED: [string, string][] = [
  ["tmt", "reinforcement steel"],
  ["shuttering", "formwork"],
  ["jcb", "backhoe loader"],
];

export interface ParsedQuery {
  text: string;
  prefix: string | null;
  entityType: EntityType | null;
}

/** Splits a typed prefix from the query text. Returns the entity type when the prefix names an indexed type. */
export function parseQuery(raw: string): { query: ParsedQuery | null; problem: string | null; notIndexed: string | null } {
  const text = raw.trim();
  if (text.length < 1 || text.length > 100) return { query: null, problem: "type between 1 and 100 characters", notIndexed: null };
  const m = /^([a-z]{2,8}):\s*(.*)$/i.exec(text);
  if (!m) return { query: { text, prefix: null, entityType: null }, problem: null, notIndexed: null };
  const prefix = m[1].toLowerCase();
  const rest = m[2].trim();
  if (PREFIXES[prefix]) return { query: { text: rest, prefix, entityType: PREFIXES[prefix] }, problem: null, notIndexed: null };
  if ((UNINDEXED_PREFIXES as readonly string[]).includes(prefix)) return { query: null, problem: null, notIndexed: prefix };
  return { query: { text, prefix: null, entityType: null }, problem: null, notIndexed: null };
}

async function approvedSynonyms(client: PoolClient, tenantId: string): Promise<Map<string, string[]>> {
  const { rows } = await client.query<{ term: string; expansion: string }>("SELECT term, expansion FROM srch_synonyms WHERE tenant_id = $1 AND status = 'approved'", [tenantId]);
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.term, [...(map.get(r.term) ?? []), r.expansion]);
  return map;
}

/** Builds a websearch query string with the approved synonyms joined by OR. Quoting keeps user text out of the query syntax. */
export function expandedQuery(text: string, synonyms: Map<string, string[]>): string {
  const lower = text.toLowerCase();
  const extra = [...(synonyms.get(lower) ?? [])];
  if (extra.length === 0) return text;
  return [text, ...extra.map((e) => `"${e.replace(/"/g, "")}"`)].join(" or ");
}

export interface SearchHit {
  entityType: EntityType;
  entityId: string;
  title: string;
  subtitle: string;
  route: string;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  facets: Record<EntityType, number>;
  notIndexed: string | null;
  problem: string | null;
}

async function viewerScope(pool: Pool, ctx: RequestContext, now: Date) {
  const [all, people, confidential, restricted, secure] = await Promise.all([
    can(pool, ctx, "srch.scope.all"),
    can(pool, ctx, "srch.people.view"),
    can(pool, ctx, "srch.confidential.view"),
    can(pool, ctx, "srch.restricted.view"),
    can(pool, ctx, "srch.secure.view"),
  ]);
  const classes = ["general", ...(confidential.allowed ? ["confidential"] : []), ...(restricted.allowed ? ["restricted"] : []), ...(secure.allowed ? ["secure"] : [])];
  const scopes = all.allowed ? [] : await allocatedScopes(pool, ctx, ctx.userId, now.toISOString().slice(0, 10));
  const wholeProjects = scopes.filter((s) => s.siteId === null).map((s) => s.projectId);
  const projects = scopes.map((s) => s.projectId);
  const sites = scopes.filter((s) => s.siteId !== null).map((s) => s.siteId as number);
  return { all: all.allowed, people: people.allowed, classes, projects: [...new Set(projects)], wholeProjects: [...new Set(wholeProjects)], sites: [...new Set(sites)] };
}

/** Permission-safe search. Every row is filtered by the viewer's scope in the query; totals and facets come from the same filter. */
export async function search(pool: Pool, ctx: RequestContext, raw: string, opts: { limit?: number; now?: Date } = {}): Promise<SearchResult> {
  const now = opts.now ?? new Date();
  const parsed = parseQuery(raw);
  const empty = (problem: string | null, notIndexed: string | null): SearchResult => ({ hits: [], total: 0, facets: { project: 0, site: 0, person: 0 }, notIndexed, problem });
  if (parsed.problem) return empty(parsed.problem, null);
  if (parsed.notIndexed) return empty(null, parsed.notIndexed);
  const q = parsed.query!;
  if (q.text.length === 0) return empty("type something to search for", null);
  const scope = await viewerScope(pool, ctx, now);
  const limit = Math.min(opts.limit ?? 50, 100);

  const result = await withTransaction(
    pool,
    async (c) => {
      const synonyms = await approvedSynonyms(c, ctx.tenantId);
      const query = expandedQuery(q.text, synonyms);
      const access = `(
          (srch_documents.entity_type = 'project' AND ($4::boolean OR srch_documents.project_id = ANY($5::bigint[])))
       OR (srch_documents.entity_type = 'site' AND ($4::boolean OR srch_documents.project_id = ANY($6::bigint[]) OR srch_documents.site_id = ANY($7::bigint[])))
       OR (srch_documents.entity_type = 'person' AND $8::boolean))`;
      const where = `tenant_id = $1 AND doc @@ websearch_to_tsquery('simple', $2) AND confidentiality = ANY($3::text[]) AND ${access}`;
      const params = [ctx.tenantId, query, scope.classes, scope.all, scope.projects, scope.wholeProjects, scope.sites, scope.people];
      const hits = await c.query<{ entity_type: EntityType; entity_id: string; title: string; subtitle: string; route: string; rank: number; total: string }>(
        `SELECT entity_type, entity_id, title, subtitle, route, ts_rank(doc, websearch_to_tsquery('simple', $2)) AS rank, count(*) OVER () AS total
           FROM srch_documents WHERE ${where} AND ($9::text IS NULL OR entity_type = $9)
          ORDER BY rank DESC, title LIMIT $10`,
        [...params, q.entityType, limit],
      );
      const facets = await c.query<{ entity_type: EntityType; n: string }>(`SELECT entity_type, count(*) AS n FROM srch_documents WHERE ${where} GROUP BY entity_type`, params);
      const total = hits.rows.length === 0 ? 0 : Number(hits.rows[0].total);
      const counts: Record<EntityType, number> = { project: 0, site: 0, person: 0 };
      for (const f of facets.rows) counts[f.entity_type] = Number(f.n);
      if (total === 0) await c.query("INSERT INTO srch_zero_results (tenant_id, query_text, scope) VALUES ($1, $2, 'all')", [ctx.tenantId, q.text.slice(0, 100)]);
      return {
        hits: hits.rows.map((h) => ({ entityType: h.entity_type, entityId: h.entity_id, title: h.title, subtitle: h.subtitle, route: h.route })),
        total,
        facets: counts,
        notIndexed: null,
        problem: null,
      };
    },
    { tenantId: ctx.tenantId },
  );
  return result;
}

/** Test and reporting helper: the live routes the palette may offer. */
export function liveRoutes(): ReadonlySet<string> {
  return LIVE_ROUTES;
}

export { AppError };
