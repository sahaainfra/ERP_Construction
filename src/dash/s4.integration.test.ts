// Part 13 S4 database test: where-used links show only what exists, and only to a viewer who may see the master.
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
import { SEARCH_PERMISSIONS } from "../search/index";
import { whereUsed } from "./drill";

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

describe.skipIf(!TEST_URL || !APP_URL)("where-used links (Part 13 S4)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-dashs4test" });
    app = createPool(APP_URL!, { application_name: "erp-dashs4test-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [...SEARCH_PERMISSIONS]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  function inTenant<T>(tenant: string, query: (c: PoolClient) => Promise<T>): Promise<T> {
    return withTransaction(owner, query, { tenantId: tenant });
  }

  it("shows the sites and allocations of a project only to a viewer allocated to it, and nothing when there are none", async () => {
    const tenant = randomUUID();
    const viewer = "WUVIEWER00001";
    const ids = await inTenant(tenant, async (c) => {
      const le = await c.query<{ id: string }>("INSERT INTO org_legal_entities (tenant_id, code, legal_name, pan, registered_address, created_by, change_reason) VALUES ($1, 'LE1', 'Test Constructions Pvt Ltd', 'ABCDE1234F', 'Pune office, Baner', 'bootstrap', 'Test fixture') RETURNING id", [tenant]);
      const p1 = await c.query<{ id: string }>("INSERT INTO org_projects (tenant_id, code, name, legal_entity_id, project_type, created_by, change_reason) VALUES ($1, 'P-1', 'Riverside bridge', $2, 'road_highway', 'bootstrap', 'Test fixture') RETURNING id", [tenant, le.rows[0].id]);
      const p2 = await c.query<{ id: string }>("INSERT INTO org_projects (tenant_id, code, name, legal_entity_id, project_type, created_by, change_reason) VALUES ($1, 'P-2', 'Metro viaduct', $2, 'metro_rail', 'bootstrap', 'Test fixture') RETURNING id", [tenant, le.rows[0].id]);
      await c.query("INSERT INTO org_sites (tenant_id, code, name, project_id, site_type, state_code, created_by, change_reason) VALUES ($1, 'S-1', 'Yard', $2, 'store_yard', '27', 'bootstrap', 'Test fixture')", [tenant, p1.rows[0].id]);
      await c.query("INSERT INTO org_sites (tenant_id, code, name, project_id, site_type, state_code, created_by, change_reason) VALUES ($1, 'S-2', 'Plant', $2, 'batching_plant_site', '27', 'bootstrap', 'Test fixture')", [tenant, p1.rows[0].id]);
      await c.query("INSERT INTO org_project_allocations (tenant_id, user_ref, project_id, role_on_project, valid_from, allocation_pct, reason, created_by) VALUES ($1, $2, $3, 'engineer', '2026-01-01', 100, 'Site engineer on the bridge', 'bootstrap')", [tenant, viewer, p1.rows[0].id]);
      return { p1: p1.rows[0].id, p2: p2.rows[0].id };
    });
    const ctx = contextFor(tenant, viewer);
    expect(await whereUsed(app, ctx, { type: "project", id: ids.p1 })).toEqual([
      { label: "Sites", count: 2, route: `/projects/${ids.p1}` },
      { label: "People allocated", count: 1, route: `/projects/${ids.p1}` },
    ]);
    expect(await whereUsed(app, ctx, { type: "project", id: ids.p2 })).toEqual([]);
    expect(await whereUsed(app, ctx, { type: "person", id: viewer })).toEqual([{ label: "Project allocations", count: 1, route: `/people/${viewer}` }]);
    expect(await whereUsed(app, ctx, { type: "person", id: "WUOTHER00001" })).toEqual([]);
  });
});
