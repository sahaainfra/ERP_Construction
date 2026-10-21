// Part 12 S2 database tests: per-user preferences (defaults, own-row updates, refusal of invalid patches, isolation between users
// and tenants) and permission-filtered navigation checks through the Part 07 engine.
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
import { BRANDING_PERMISSIONS } from "./branding";
import { getUserPreferences, setUserPreferences, DEFAULT_USER_PREFERENCES } from "./preferences-server";
import { permittedAmong } from "./navigation-access";

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

describe.skipIf(!TEST_URL || !APP_URL)("shell preferences and permission-filtered navigation (Part 12 S2)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-shelltest" });
    app = createPool(APP_URL!, { application_name: "erp-shelltest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [...BRANDING_PERMISSIONS]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  async function grant(tenant: string, userId: string, keys: string[]): Promise<void> {
    await withTransaction(owner, async (c) => {
      const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'Shell test role', 'bootstrap') RETURNING id", [tenant, `shell_${randomUUID().slice(0, 8)}`]);
      for (const key of keys) {
        await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, $3, 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap shell grant')", [tenant, role.rows[0].id, key]);
      }
      await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap shell assignment')", [tenant, userId, role.rows[0].id]);
    }, { tenantId: tenant });
  }

  it("returns the defaults for a user who has not chosen, and stores only the user's own choices", async () => {
    const tenant = randomUUID();
    const alice = contextFor(tenant, "ALICE00001");
    const bob = contextFor(tenant, "BOB000001");
    expect(await getUserPreferences(app, alice)).toEqual(DEFAULT_USER_PREFERENCES);
    const saved = await setUserPreferences(app, alice, { theme: "dark", density: "compact", pinned: ["/"] });
    expect(saved).toEqual({ theme: "dark", density: "compact", navCollapsed: false, pinned: ["/"] });
    expect(await getUserPreferences(app, alice)).toEqual(saved);
    expect(await getUserPreferences(app, bob)).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("refuses an invalid patch and stores nothing from it", async () => {
    const tenant = randomUUID();
    const carol = contextFor(tenant, "CAROL00001");
    await setUserPreferences(app, carol, { density: "touch" });
    await expect(setUserPreferences(app, carol, { theme: "neon", pinned: ["/projects"] })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await getUserPreferences(app, carol)).toMatchObject({ theme: "system", density: "touch", pinned: [] });
  });

  it("keeps one tenant's preferences from another tenant, even for the same user id", async () => {
    const userId = "DAVE00001";
    const first = randomUUID();
    const second = randomUUID();
    await setUserPreferences(app, contextFor(first, userId), { theme: "high-contrast" });
    expect(await getUserPreferences(app, contextFor(second, userId))).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("reports only the permissions the user holds, checked through the permission engine", async () => {
    const tenant = randomUUID();
    const user = randomUUID();
    await grant(tenant, user, ["ui.branding.manage"]);
    const ctx = contextFor(tenant, user);
    const granted = await permittedAmong(app, ctx, ["ui.branding.manage", "ui.branding.approve"]);
    expect([...granted]).toEqual(["ui.branding.manage"]);
    expect((await permittedAmong(app, contextFor(tenant), ["ui.branding.manage"])).size).toBe(0);
  });
});
