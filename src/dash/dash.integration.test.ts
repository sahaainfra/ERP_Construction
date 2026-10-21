// Part 13 S1 database tests: visibility by permission and by live module, the space order (personal, role, default), validation of a
// personal arrangement, reset, and tenant isolation. Real widgets are run through their owning modules' own checks.
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { registerPermissions } from "../iam/roles";
import { SECURITY_PERMISSIONS } from "../secgov/security";
import { runWidgets } from "./runtime";
import { effectiveSpace, runSpace, setPersonalSpace, resetPersonalSpace, DEFAULT_SPACE } from "./spaces";

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

describe.skipIf(!TEST_URL || !APP_URL)("dashboard engine foundation (Part 13 S1)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-dashtest" });
    app = createPool(APP_URL!, { application_name: "erp-dashtest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [...SECURITY_PERMISSIONS]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  function inTenant<T>(tenant: string, query: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
    return withTransaction(owner, query, { tenantId: tenant });
  }

  /** Grants keys through a role, the way the IAM tests do. Optionally assigns the role to the user. */
  async function grant(tenant: string, userId: string, keys: string[], roleCode = `dash_${randomUUID().slice(0, 8)}`): Promise<void> {
    await withTransaction(owner, async (c) => {
      const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'Dashboard test role', 'bootstrap') RETURNING id", [tenant, roleCode]);
      for (const key of keys) {
        await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, $3, 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap dashboard grant')", [tenant, role.rows[0].id, key]);
      }
      await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap dashboard assignment')", [tenant, userId, role.rows[0].id]);
    }, { tenantId: tenant });
  }

  it("shows a security widget only to a viewer who may see security events, and never as an error", async () => {
    const tenant = randomUUID();
    const plain = contextFor(tenant);
    const outcomes = await runWidgets(app, plain, ["security-alerts", "my-sign-ins"]);
    expect(outcomes.map((o) => o.code)).toEqual(["my-sign-ins"]);

    const viewer = randomUUID();
    await grant(tenant, viewer, ["secgov.security.view"]);
    const withRight = await runWidgets(app, contextFor(tenant, viewer), ["security-alerts"]);
    expect(withRight).toEqual([expect.objectContaining({ code: "security-alerts", status: "ok", result: expect.objectContaining({ kind: "metric", value: 0, label: "ACTUAL" }) })]);
  });

  it("runs the real widgets for a new user: their projects and sign-ins are empty lists, not errors", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    const outcomes = await runWidgets(app, ctx, ["my-projects-sites", "my-sign-ins"]);
    expect(outcomes).toEqual([
      expect.objectContaining({ code: "my-projects-sites", status: "ok", result: expect.objectContaining({ kind: "list", items: [] }) }),
      expect.objectContaining({ code: "my-sign-ins", status: "ok", result: expect.objectContaining({ kind: "list", items: [] }) }),
    ]);
  });

  it("uses the default space when the viewer has no role space and no arrangement, filtered by permission", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    const space = await effectiveSpace(app, ctx);
    expect(space.source).toBe("default");
    expect(space.widgets.map((w) => w.code)).toEqual(DEFAULT_SPACE);
    const run = await runSpace(app, ctx);
    expect(run.outcomes.map((o) => o.code)).toEqual(["my-projects-sites", "my-sign-ins"]);
  });

  it("uses the active role space of the viewer's role, and filters its widgets by permission", async () => {
    const tenant = randomUUID();
    const user = randomUUID();
    const roleCode = "site_engineer";
    await grant(tenant, user, [], roleCode);
    await inTenant(tenant, (c) => c.query(
      `INSERT INTO ui_role_spaces (tenant_id, role_code, version, widget_codes, status, created_by, approved_by, reason, approved_at)
       VALUES ($1, $2, 1, ARRAY['my-sign-ins', 'security-alerts'], 'active', 'designer', 'approver', 'Default space for site engineers', now())`,
      [tenant, roleCode],
    ));
    const ctx = contextFor(tenant, user);
    const space = await effectiveSpace(app, ctx);
    expect(space.source).toBe("role");
    const run = await runSpace(app, ctx);
    expect(run.outcomes.map((o) => o.code)).toEqual(["my-sign-ins"]);
  });

  it("stores a personal arrangement only when every widget is visible to the viewer, and resets it", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    await expect(setPersonalSpace(app, ctx, [{ code: "security-alerts", size: "s" }])).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(setPersonalSpace(app, ctx, [{ code: "my-sign-ins", size: "l" }])).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(setPersonalSpace(app, ctx, [{ code: "my-sign-ins", size: "s" }, { code: "my-sign-ins", size: "s" }])).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await setPersonalSpace(app, ctx, [{ code: "my-sign-ins", size: "m" }]);
    const mine = await effectiveSpace(app, ctx);
    expect(mine).toEqual({ source: "personal", widgets: [{ code: "my-sign-ins", size: "m" }] });
    expect((await runSpace(app, ctx)).outcomes.map((o) => o.code)).toEqual(["my-sign-ins"]);

    await resetPersonalSpace(app, ctx);
    expect((await effectiveSpace(app, ctx)).source).toBe("default");
  });

  it("keeps one tenant's arrangement and role spaces from another tenant", async () => {
    const userId = "TENANTX00001";
    const a = randomUUID();
    const b = randomUUID();
    await setPersonalSpace(app, contextFor(a, userId), [{ code: "my-sign-ins", size: "s" }]);
    expect((await effectiveSpace(app, contextFor(b, userId))).source).toBe("default");
  });
});
