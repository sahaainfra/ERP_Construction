// Part 13 S2 database tests: proposing and publishing a role space (permissions, maker-checker, supersession, the outbox event), the
// persona preview under the persona's own permissions, and scope-checked filters.
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
import { SECURITY_PERMISSIONS } from "../secgov/security";
import { DASH_PERMISSIONS, proposeRoleSpace, publishRoleSpace, previewRoleSpace } from "./designer";
import { effectiveSpace } from "./spaces";
import { resolveFilters, NO_FILTERS } from "./filters";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const REASON = "Default space for site engineers from the pilot review";

function contextFor(tenantId: string, userId: string = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomBytes(4).toString("hex")}`,
  );
}

describe.skipIf(!TEST_URL || !APP_URL)("role-space designer (Part 13 S2)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-dashs2test" });
    app = createPool(APP_URL!, { application_name: "erp-dashs2test-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [...DASH_PERMISSIONS, ...SECURITY_PERMISSIONS]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  function inTenant<T>(tenant: string, query: (c: PoolClient) => Promise<T>): Promise<T> {
    return withTransaction(owner, query, { tenantId: tenant });
  }

  /** Creates a role and grants keys to a user through it. */
  async function grant(tenant: string, userId: string, keys: string[], roleCode: string): Promise<RequestContext> {
    await withTransaction(owner, async (c) => {
      const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'Designer test role', 'bootstrap') ON CONFLICT (tenant_id, role_code) DO UPDATE SET name = iam_roles.name RETURNING id", [tenant, roleCode]);
      for (const key of keys) {
        await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, $3, 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap designer grant')", [tenant, role.rows[0].id, key]);
      }
      await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap designer assignment')", [tenant, userId, role.rows[0].id]);
    }, { tenantId: tenant });
    return contextFor(tenant, userId);
  }

  it("refuses to propose without the designer permission, for an unknown role, or an invalid widget", async () => {
    const tenant = randomUUID();
    const designer = await grant(tenant, randomUUID(), ["dash.space.manage"], "site_engineer");
    await expect(proposeRoleSpace(app, contextFor(tenant), { roleCode: "site_engineer", widgetCodes: ["my-sign-ins"], reason: REASON })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(proposeRoleSpace(app, designer, { roleCode: "store_keeper", widgetCodes: ["my-sign-ins"], reason: REASON })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(proposeRoleSpace(app, designer, { roleCode: "site_engineer", widgetCodes: ["no-such"], reason: REASON })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("keeps a proposal out of effect until a second person publishes it, then emits the event", async () => {
    const tenant = randomUUID();
    const proposer = await grant(tenant, randomUUID(), ["dash.space.manage", "dash.space.publish"], "site_engineer");
    const publisher = await grant(tenant, randomUUID(), ["dash.space.publish"], "site_engineer");
    const { version } = await proposeRoleSpace(app, proposer, { roleCode: "site_engineer", widgetCodes: ["my-sign-ins", "my-projects-sites"], reason: REASON });
    expect(version).toBe(1);
    expect((await effectiveSpace(app, publisher)).source).toBe("default");
    await expect(publishRoleSpace(app, proposer, { roleCode: "site_engineer", version, reason: "Publishing my own proposal" })).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    await publishRoleSpace(app, publisher, { roleCode: "site_engineer", version, reason: "Checked against the pilot review" });
    const space = await effectiveSpace(app, publisher);
    expect(space).toEqual({ source: "role", widgets: [{ code: "my-sign-ins", size: "m" }, { code: "my-projects-sites", size: "m" }] });
    const events = await owner.query("SELECT payload FROM sys.outbox WHERE event_type = 'dash.space.published' AND payload->>'roleCode' = 'site_engineer'");
    expect(events.rows).toEqual([{ payload: { roleCode: "site_engineer", version: 1, widgetCount: 2 } }]);
  });

  it("supersedes the active space with a newer publication, leaving one active version", async () => {
    const tenant = randomUUID();
    const proposer = await grant(tenant, randomUUID(), ["dash.space.manage"], "site_engineer");
    const publisher = await grant(tenant, randomUUID(), ["dash.space.publish"], "site_engineer");
    const first = await proposeRoleSpace(app, proposer, { roleCode: "site_engineer", widgetCodes: ["my-sign-ins"], reason: REASON });
    await publishRoleSpace(app, publisher, { roleCode: "site_engineer", version: first.version, reason: "First version approved" });
    const second = await proposeRoleSpace(app, proposer, { roleCode: "site_engineer", widgetCodes: ["my-projects-sites"], reason: "Second version after review" });
    await publishRoleSpace(app, publisher, { roleCode: "site_engineer", version: second.version, reason: "Second version approved" });
    const rows = await inTenant(tenant, (c) => c.query<{ version: number; status: string }>("SELECT version, status FROM ui_role_spaces ORDER BY version"));
    expect(rows.rows).toEqual([{ version: 1, status: "superseded" }, { version: 2, status: "active" }]);
  });

  it("refuses to publish without the publish permission", async () => {
    const tenant = randomUUID();
    const proposer = await grant(tenant, randomUUID(), ["dash.space.manage"], "site_engineer");
    const { version } = await proposeRoleSpace(app, proposer, { roleCode: "site_engineer", widgetCodes: ["my-sign-ins"], reason: REASON });
    await expect(publishRoleSpace(app, proposer, { roleCode: "site_engineer", version, reason: "Publishing without the right" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("previews a role space as a persona sees it, using the persona's own permissions", async () => {
    const tenant = randomUUID();
    const designer = await grant(tenant, randomUUID(), ["dash.space.manage", "dash.space.publish"], "site_engineer");
    const persona = randomUUID();
    await grant(tenant, persona, [], "unused_role");
    const { version } = await proposeRoleSpace(app, designer, { roleCode: "site_engineer", widgetCodes: ["my-sign-ins", "security-alerts"], reason: REASON });
    await publishRoleSpace(app, designer, { roleCode: "site_engineer", version, reason: "Published for the preview test" }).catch(async () => {
      const second = await grant(tenant, randomUUID(), ["dash.space.publish"], "site_engineer");
      await publishRoleSpace(app, second, { roleCode: "site_engineer", version, reason: "Published for the preview test" });
    });
    const preview = await previewRoleSpace(app, designer, { roleCode: "site_engineer", personaUserId: persona });
    expect(preview).toEqual({ roleCode: "site_engineer", version: 1, visible: ["my-sign-ins"], hidden: ["security-alerts"] });
    expect((await previewRoleSpace(app, designer, { roleCode: "store_keeper", personaUserId: persona })).version).toBeNull();
  });

  it("accepts an empty filter and refuses a project the viewer is not allocated to", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    expect(await resolveFilters(app, ctx, NO_FILTERS)).toEqual({ filters: NO_FILTERS, problems: [] });
    const refused = await resolveFilters(app, ctx, { ...NO_FILTERS, projectId: 999, siteId: 4 });
    expect(refused.problems).toEqual([expect.objectContaining({ field: "project" })]);
    expect(refused.filters).toEqual(NO_FILTERS);
  });
});
