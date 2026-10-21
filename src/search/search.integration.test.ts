// Part 13 S3 database tests. Fixtures are real organisation rows (legal entity, projects, site, allocation) and one indexed person.
// The access matrix (CP-DASH-02) checks that no result, count or facet reveals a record outside the viewer's scope.
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { registerPermissions } from "../iam/roles";
import { DASH_PERMISSIONS } from "../dash/designer";
import { SECURITY_PERMISSIONS } from "../secgov/security";
import { reconcileIndex, SEARCH_PERMISSIONS } from "./index";
import { search } from "./query";
import { recordRecent, listRecent, addFavourite, listFavourites, removeFavourite, commandActions, RECENT_LIMIT, COMMAND_ACTIONS } from "./usage";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

function contextFor(tenantId: string, userId: string = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomBytes(4).toString("hex")}`,
  );
}

describe.skipIf(!TEST_URL || !APP_URL)("search, actions and usage (Part 13 S3)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-searchtest" });
    app = createPool(APP_URL!, { application_name: "erp-searchtest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [...SEARCH_PERMISSIONS, ...DASH_PERMISSIONS, ...SECURITY_PERMISSIONS]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  function inTenant<T>(tenant: string, query: (c: PoolClient) => Promise<T>): Promise<T> {
    return withTransaction(owner, query, { tenantId: tenant });
  }

  async function grant(tenant: string, userId: string, keys: string[]): Promise<RequestContext> {
    await withTransaction(owner, async (c) => {
      const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'Search test role', 'bootstrap') RETURNING id", [tenant, `srch_${randomUUID().slice(0, 8)}`]);
      for (const key of keys) {
        await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, $3, 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap search grant')", [tenant, role.rows[0].id, key]);
      }
      await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap search assignment')", [tenant, userId, role.rows[0].id]);
    }, { tenantId: tenant });
    return contextFor(tenant, userId);
  }

  /** Legal entity, two projects, one site in the second project, and an indexed person. Returns the project ids. */
  async function fixtures(tenant: string, viewer: string): Promise<{ p1: string; p2: string; site: string }> {
    return inTenant(tenant, async (c) => {
      const le = await c.query<{ id: string }>("INSERT INTO org_legal_entities (tenant_id, code, legal_name, pan, registered_address, created_by, change_reason) VALUES ($1, 'LE1', 'Test Constructions Pvt Ltd', 'ABCDE1234F', 'Pune office, Baner', 'bootstrap', 'Test fixture') RETURNING id", [tenant]);
      const p1 = await c.query<{ id: string }>("INSERT INTO org_projects (tenant_id, code, name, legal_entity_id, project_type, created_by, change_reason) VALUES ($1, 'P-1', 'Riverside bridge', $2, 'road_highway', 'bootstrap', 'Test fixture') RETURNING id", [tenant, le.rows[0].id]);
      const p2 = await c.query<{ id: string }>("INSERT INTO org_projects (tenant_id, code, name, legal_entity_id, project_type, created_by, change_reason) VALUES ($1, 'P-2', 'Metro viaduct', $2, 'metro_rail', 'bootstrap', 'Test fixture') RETURNING id", [tenant, le.rows[0].id]);
      const site = await c.query<{ id: string }>("INSERT INTO org_sites (tenant_id, code, name, project_id, site_type, state_code, created_by, change_reason) VALUES ($1, 'S-20', 'Batching plant', $2, 'batching_plant_site', '27', 'bootstrap', 'Test fixture') RETURNING id", [tenant, p2.rows[0].id]);
      await c.query("INSERT INTO org_project_allocations (tenant_id, user_ref, project_id, role_on_project, valid_from, allocation_pct, reason, created_by) VALUES ($1, $2, $3, 'engineer', '2026-01-01', 100, 'Site engineer on the bridge', 'bootstrap')", [tenant, viewer, p1.rows[0].id]);
      await c.query("INSERT INTO auth_users (tenant_id, user_id, person_type, display_name, created_by, state_reason, state) VALUES ($1, 'ASHA00001', 'internal', 'Asha Rao', 'bootstrap', 'Test fixture', 'active')", [tenant]);
      return { p1: p1.rows[0].id, p2: p2.rows[0].id, site: site.rows[0].id };
    });
  }

  it("indexes projects, sites and people from the organisation tables, and no personal field", async () => {
    const tenant = randomUUID();
    const admin = await grant(tenant, randomUUID(), ["srch.index.manage"]);
    await fixtures(tenant, "VIEWER00001");
    const counts = await reconcileIndex(app, admin);
    expect(counts).toEqual({ projects: 2, sites: 1, people: 1 });
    const rows = await inTenant(tenant, (c) => c.query<{ title: string; subtitle: string }>("SELECT title, subtitle FROM srch_documents WHERE entity_type = 'person'"));
    expect(rows.rows).toEqual([{ title: "Asha Rao", subtitle: "ASHA00001 · internal" }]);
    await expect(reconcileIndex(app, contextFor(tenant))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gives no result, count or facet for a project outside the viewer's allocations (CP-DASH-02)", async () => {
    const tenant = randomUUID();
    const admin = await grant(tenant, randomUUID(), ["srch.index.manage"]);
    const viewer = "VIEWER00002";
    await fixtures(tenant, viewer);
    await reconcileIndex(app, admin);
    const ctx = contextFor(tenant, viewer);
    const bridge = await search(app, ctx, "bridge", { now: new Date() });
    expect(bridge.hits.map((h) => h.title)).toEqual(["P-1 Riverside bridge"]);
    expect(bridge.total).toBe(1);
    const metro = await search(app, ctx, "metro");
    expect(metro).toMatchObject({ hits: [], total: 0, facets: { project: 0, site: 0, person: 0 } });
    expect((await search(app, ctx, "P-2")).total).toBe(0);
    expect((await search(app, ctx, "batching")).total).toBe(0);
    expect((await search(app, ctx, "Asha")).total).toBe(0);
  });

  it("shows everything to a viewer with the scope permission, and counts match the hits", async () => {
    const tenant = randomUUID();
    const admin = await grant(tenant, randomUUID(), ["srch.index.manage"]);
    const boss = await grant(tenant, randomUUID(), ["srch.scope.all", "srch.people.view"]);
    await fixtures(tenant, "VIEWER00003");
    await reconcileIndex(app, admin);
    const all = await search(app, boss, "P-1 OR P-2 OR batching OR Asha OR metro");
    expect(all.total).toBe(all.hits.length);
    expect(all.facets).toEqual({ project: 2, site: 1, person: 1 });
  });

  it("keeps people out of results unless the viewer may find people, and keeps restricted results from others", async () => {
    const tenant = randomUUID();
    const admin = await grant(tenant, randomUUID(), ["srch.index.manage"]);
    const boss = await grant(tenant, randomUUID(), ["srch.scope.all"]);
    await fixtures(tenant, "VIEWER00004");
    await reconcileIndex(app, admin);
    await inTenant(tenant, (c) => c.query("INSERT INTO srch_documents (tenant_id, entity_type, entity_id, title, subtitle, route, project_id, confidentiality, doc) VALUES ($1, 'site', '901', 'Vault key site', 'secret plan', '/projects/1/sites/901', (SELECT id FROM org_projects WHERE code = 'P-1'), 'restricted', to_tsvector('simple', 'Vault key site secret plan'))", [tenant]));
    expect((await search(app, boss, "Asha")).total).toBe(0);
    expect((await search(app, boss, "vault")).total).toBe(0);
    const restricted = await grant(tenant, randomUUID(), ["srch.scope.all", "srch.people.view", "srch.restricted.view"]);
    expect((await search(app, restricted, "vault")).total).toBe(1);
    expect((await search(app, restricted, "Asha")).total).toBe(1);
  });

  it("applies approved synonyms only, and records a zero result without the person who searched", async () => {
    const tenant = randomUUID();
    const admin = await grant(tenant, randomUUID(), ["srch.index.manage"]);
    const boss = await grant(tenant, randomUUID(), ["srch.scope.all"]);
    await fixtures(tenant, "VIEWER00005");
    await reconcileIndex(app, admin);
    await inTenant(tenant, (c) => c.query("INSERT INTO org_sites (tenant_id, code, name, project_id, site_type, state_code, created_by, change_reason) SELECT tenant_id, 'S-30', 'Reinforcement steel yard', id, 'store_yard', '27', 'bootstrap', 'Test fixture' FROM org_projects WHERE code = 'P-1'"));
    await reconcileIndex(app, admin);
    expect((await search(app, boss, "tmt")).total).toBe(0);
    await inTenant(tenant, (c) => c.query("INSERT INTO srch_synonyms (tenant_id, term, expansion, status) VALUES ($1, 'tmt', 'reinforcement steel', 'approved')", [tenant]));
    expect((await search(app, boss, "tmt")).hits.map((h) => h.title)).toEqual(["S-30 Reinforcement steel yard"]);
    const zero = await inTenant(tenant, (c) => c.query<{ query_text: string; scope: string }>("SELECT query_text, scope FROM srch_zero_results"));
    expect(zero.rows).toEqual([{ query_text: "tmt", scope: "all" }]);
  });

  it("answers a prefix for a module not built as not indexed, and an empty query with a message", async () => {
    const ctx = contextFor(randomUUID());
    expect(await search(app, ctx, "po: P2")).toMatchObject({ hits: [], notIndexed: "po" });
    expect(await search(app, ctx, "   ")).toMatchObject({ hits: [] });
    expect((await search(app, ctx, "   ")).problem).toMatch(/between 1 and 100/);
  });

  it("keeps recent items to the last 50 and favourites for the person who saved them", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    for (let i = 0; i < RECENT_LIMIT + 2; i++) {
      await recordRecent(app, ctx, { entityType: "project", entityId: String(i), title: `Project ${i}`, route: `/projects/${i}` });
    }
    const recent = await listRecent(app, ctx);
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent[0].title).toBe(`Project ${RECENT_LIMIT + 1}`);
    await addFavourite(app, ctx, { entityType: "site", entityId: "20", title: "Batching plant", route: "/projects/2/sites/20" });
    expect((await listFavourites(app, ctx)).map((f) => f.title)).toEqual(["Batching plant"]);
    expect((await listFavourites(app, contextFor(tenant))).length).toBe(0);
    await removeFavourite(app, ctx, "site", "20");
    expect(await listFavourites(app, ctx)).toEqual([]);
  });

  it("offers a command action only when its module, route and permission all allow it", async () => {
    const tenant = randomUUID();
    const plain = contextFor(tenant);
    const security = await grant(tenant, randomUUID(), ["secgov.security.view"]);
    const live = { liveModules: new Set(["secgov", "auth", "org"]), liveRoutes: new Set(["/security/events", "/account/sign-ins", "/projects"]) };
    expect((await commandActions(app, plain, live)).map((a) => a.code)).toEqual(["open-my-sign-ins", "open-my-projects"]);
    expect((await commandActions(app, security, live)).map((a) => a.code)).toEqual(["open-security-events", "open-my-sign-ins", "open-my-projects"]);
    expect(await commandActions(app, security, { liveRoutes: new Set() })).toEqual([]);
    expect(COMMAND_ACTIONS.length).toBe(3);
  });
});

