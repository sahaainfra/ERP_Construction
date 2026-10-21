// Part 13 S5 database tests: the record timeline and the project timeline read the audit chain, newest first; another person's change
// is restricted activity to a viewer without the people permission; a project outside the viewer's allocations has no timeline.
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
import { writeAudit } from "../secgov/audit";
import { SEARCH_PERMISSIONS } from "../search/index";
import { entityTimeline, projectTimeline, humanise } from "./timeline";

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

describe.skipIf(!TEST_URL || !APP_URL)("activity timeline (Part 13 S5)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-dashs5test" });
    app = createPool(APP_URL!, { application_name: "erp-dashs5test-app" });
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

  async function grant(tenant: string, userId: string, keys: string[]): Promise<RequestContext> {
    await withTransaction(owner, async (c) => {
      const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'Timeline test role', 'bootstrap') RETURNING id", [tenant, `tl_${randomUUID().slice(0, 8)}`]);
      for (const key of keys) {
        await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, $3, 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap timeline grant')", [tenant, role.rows[0].id, key]);
      }
      await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap timeline assignment')", [tenant, userId, role.rows[0].id]);
    }, { tenantId: tenant });
    return contextFor(tenant, userId);
  }

  /** Project P-1 with one site, allocated to `viewer`. Returns the project id and the site id. */
  async function fixtures(tenant: string, viewer: string): Promise<{ project: string; site: string }> {
    return inTenant(tenant, async (c) => {
      const le = await c.query<{ id: string }>("INSERT INTO org_legal_entities (tenant_id, code, legal_name, pan, registered_address, created_by, change_reason) VALUES ($1, 'LE1', 'Test Constructions Pvt Ltd', 'ABCDE1234F', 'Pune office, Baner', 'bootstrap', 'Test fixture') RETURNING id", [tenant]);
      const p = await c.query<{ id: string }>("INSERT INTO org_projects (tenant_id, code, name, legal_entity_id, project_type, created_by, change_reason) VALUES ($1, 'P-1', 'Riverside bridge', $2, 'road_highway', 'bootstrap', 'Test fixture') RETURNING id", [tenant, le.rows[0].id]);
      const s = await c.query<{ id: string }>("INSERT INTO org_sites (tenant_id, code, name, project_id, site_type, state_code, created_by, change_reason) VALUES ($1, 'S-1', 'Yard', $2, 'store_yard', '27', 'bootstrap', 'Test fixture') RETURNING id", [tenant, p.rows[0].id]);
      await c.query("INSERT INTO org_project_allocations (tenant_id, user_ref, project_id, role_on_project, valid_from, allocation_pct, reason, created_by) VALUES ($1, $2, $3, 'engineer', '2026-01-01', 100, 'Site engineer on the bridge', 'bootstrap')", [tenant, viewer, p.rows[0].id]);
      return { project: p.rows[0].id, site: s.rows[0].id };
    });
  }

  it("shows a record's history newest first, with the actor and the reason, and hides another person's change", async () => {
    const tenant = randomUUID();
    const actor = contextFor(tenant, "TLACTOR00001");
    const viewer = contextFor(tenant, "TLVIEWER00001");
    const f = await fixtures(tenant, "TLVIEWER00001");
    await withTransaction(app, async (c) => {
      await writeAudit(c, actor, { action: "org.project.created", entityType: "project", entityId: f.project, reason: "New project from the award letter" });
    }, { tenantId: tenant });
    await withTransaction(app, async (c) => {
      await writeAudit(c, viewer, { action: "org.project.reviewed", entityType: "project", entityId: f.project, reason: "Reviewed the project plan" });
    }, { tenantId: tenant });

    const own = await entityTimeline(app, viewer, { entityType: "project", entityId: f.project });
    expect(own.label).toBe("ACTUAL");
    expect(own.entries.map((e) => [e.who, e.what, e.restricted])).toEqual([
      ["TLVIEWER00001", "Reviewed", false],
      ["Restricted", "restricted activity", true],
    ]);
    expect(own.entries[0].reason).toBe("Reviewed the project plan");
    expect(own.entries[1].reason).toBeNull();
    expect(JSON.stringify(own.entries)).not.toContain("TLACTOR00001");
    expect(JSON.stringify(own.entries)).not.toContain("award letter");

    const people = await grant(tenant, "TLPPL00001", ["srch.people.view"]);
    const seen = await entityTimeline(app, people, { entityType: "project", entityId: f.project });
    expect(seen.entries.map((e) => e.who)).toEqual(["TLVIEWER00001", "TLACTOR00001"]);
  });

  it("includes the activity of the project's sites, and gives no timeline for a project the viewer is not allocated to", async () => {
    const tenant = randomUUID();
    const viewer = contextFor(tenant, "TLVIEWER00002");
    const f = await fixtures(tenant, "TLVIEWER00002");
    await withTransaction(app, async (c) => {
      await writeAudit(c, viewer, { action: "org.site.activated", entityType: "site", entityId: f.site, reason: "Site opened for mobilisation" });
    }, { tenantId: tenant });
    const timeline = await projectTimeline(app, viewer, f.project);
    expect(timeline.entries.map((e) => e.what)).toEqual(["Activated"]);

    const stranger = contextFor(tenant, "TLSTR00001");
    expect((await projectTimeline(app, stranger, f.project)).entries).toEqual([]);
  });

  it("keeps one tenant's timeline from another, and reads the action as a sentence", async () => {
    const tenant = randomUUID();
    const other = randomUUID();
    const viewer = contextFor(tenant, "TLVIEWER00003");
    const f = await fixtures(tenant, "TLVIEWER00003");
    await withTransaction(app, async (c) => {
      await writeAudit(c, viewer, { action: "org.project.created", entityType: "project", entityId: f.project, reason: "Created for the isolation test" });
    }, { tenantId: tenant });
    expect((await entityTimeline(app, contextFor(other, "TLVIEWER00003"), { entityType: "project", entityId: f.project })).entries).toEqual([]);
    expect(humanise("org.project.created")).toBe("Created");
    expect(humanise("secgov.security.event_raised")).toBe("Event raised");
  });
});
