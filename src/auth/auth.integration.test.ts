// Part 08A S1 acceptance tests: user IDs, provisioning, account states, sign-in gate, password change. Database tests.
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
import { verifyAccess, refreshSession, insertCredentials, type Keys } from "../iam/auth";
import { createUser, setState, getUser, USER_PERMISSIONS } from "./users";
import { changePassword, mustChangePassword, signIn } from "./signin";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const REASON = "New starter for the Pune project team";

function contextFor(tenantId: string, userId: string = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

async function expectRefused(work: Promise<unknown>, code: string, text?: string): Promise<void> {
  const error = await work.then(() => null, (e: { code?: string; reason?: string }) => e);
  expect(error, "expected the action to be refused").not.toBeNull();
  expect(error).toMatchObject({ code });
  if (text) expect(String((error as { reason?: string }).reason ?? "")).toContain(text);
}

describe.skipIf(!TEST_URL || !APP_URL)("users, sign-in and password change (Part 08A S1)", () => {
  let owner: Pool;
  let app: Pool;
  const keys: Keys = { tokenKey: randomBytes(32), mfaKey: randomBytes(32) };

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-authsvctest" });
    app = createPool(APP_URL!, { application_name: "erp-authsvctest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [...USER_PERMISSIONS]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  async function administrator(tenant: string): Promise<RequestContext> {
    const admin = contextFor(tenant);
    await withTransaction(owner, async (c) => {
      const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'User administrator', 'bootstrap') RETURNING id", [tenant, `usr_${randomUUID().slice(0, 8)}`]);
      await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, 'auth.user.manage', 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap user administration grant')", [tenant, role.rows[0].id]);
      await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap user administration assignment')", [tenant, admin.userId, role.rows[0].id]);
    }, { tenantId: tenant });
    return admin;
  }

  it("creates users with sequential User IDs per company, and refuses a second live user for one person", async () => {
    const tenant = randomUUID();
    const admin = await administrator(tenant);
    const a = await createUser(app, admin, { companyCode: "ACME", personType: "internal", personRef: "EMP-1", displayName: "Asha Rao", reason: REASON });
    const b = await createUser(app, admin, { companyCode: "ACME", personType: "internal", personRef: "EMP-2", displayName: "Vikram Shah", reason: REASON });
    const c = await createUser(app, admin, { companyCode: "BETA", personType: "internal", personRef: "EMP-3", displayName: "Meera Iyer", reason: REASON });
    expect([a.userId, b.userId, c.userId]).toEqual(["ACME00001", "ACME00002", "BETA00001"]);
    expect(a.initialPassword.length).toBeGreaterThanOrEqual(16);
    await expectRefused(createUser(app, admin, { companyCode: "ACME", personType: "internal", personRef: "EMP-1", displayName: "Duplicate", reason: REASON }), "CONFLICT");
    expect(await getUser(app, admin, a.userId)).toMatchObject({ state: "pending_activation", mustChange: true });
  });

  it("writes the credential inside the caller's transaction, so a rollback leaves no credential behind", async () => {
    const tenant = randomUUID();
    const userId = "ROLL000001";
    await expect(
      withTransaction(app, async (client) => {
        await insertCredentials(client, tenant, userId, "a fresh quiet phrase 42");
        throw new Error("the rest of the provisioning failed");
      }, { tenantId: tenant }),
    ).rejects.toThrow("the rest of the provisioning failed");
    const left = await withTransaction(app, (c) => c.query("SELECT 1 FROM iam_credentials WHERE user_ref = $1", [userId]), { tenantId: tenant });
    expect(left.rowCount).toBe(0);
  });

  it("refuses a person without the user-management permission", async () => {
    const tenant = randomUUID();
    await administrator(tenant);
    await expectRefused(createUser(app, contextFor(tenant), { companyCode: "ACME", personType: "internal", displayName: "No rights", reason: REASON }), "FORBIDDEN");
  });

  it("signs a first-time user in with the initial password, forces a change, and refuses an invalid password with the generic answer", async () => {
    const tenant = randomUUID();
    const admin = await administrator(tenant);
    const u = await createUser(app, admin, { companyCode: "ACME", personType: "internal", personRef: "EMP-9", displayName: "Ravi Menon", reason: REASON });
    const session = await signIn(app, keys, { tenantId: tenant, userId: u.userId, password: u.initialPassword, deviceFingerprint: "office-pc" });
    expect(await verifyAccess(app, keys, { tenantId: tenant, accessToken: session.accessToken })).toMatchObject({ userRef: u.userId });
    expect(await mustChangePassword(app, tenant, u.userId)).toBe(true);
    const unknown = await signIn(app, keys, { tenantId: tenant, userId: "ACME99999", password: u.initialPassword, deviceFingerprint: "x" }).catch((e: { reason?: string }) => e.reason);
    const wrong = await signIn(app, keys, { tenantId: tenant, userId: u.userId, password: "a wrong passphrase here", deviceFingerprint: "x" }).catch((e: { reason?: string }) => e.reason);
    expect(unknown).toBe("User ID or password is incorrect");
    expect(wrong).toBe("User ID or password is incorrect");
  });

  it("gives the same answer for a suspended, deactivated or expired account, and ends the sessions of a suspended one", async () => {
    const tenant = randomUUID();
    const admin = await administrator(tenant);
    const u = await createUser(app, admin, { companyCode: "ACME", personType: "internal", personRef: "EMP-10", displayName: "Kiran Das", reason: REASON });
    const first = await signIn(app, keys, { tenantId: tenant, userId: u.userId, password: u.initialPassword, deviceFingerprint: "laptop" });
    await setState(app, admin, { userId: u.userId, to: "suspended", reason: "Under review by the site manager" });
    await expectRefused(verifyAccess(app, keys, { tenantId: tenant, accessToken: first.accessToken }), "FORBIDDEN");
    await expectRefused(signIn(app, keys, { tenantId: tenant, userId: u.userId, password: u.initialPassword, deviceFingerprint: "laptop" }), "FORBIDDEN", "");
    const generic = await signIn(app, keys, { tenantId: tenant, userId: u.userId, password: u.initialPassword, deviceFingerprint: "laptop" }).catch((e: { reason?: string }) => e.reason);
    expect(generic).toBe("User ID or password is incorrect");
    const expired = await createUser(app, admin, { companyCode: "ACME", personType: "external", personRef: "EXT-1", displayName: "Contract Tester", validFrom: "2024-01-01", validTo: "2024-06-30", reason: REASON });
    const expiredAnswer = await signIn(app, keys, { tenantId: tenant, userId: expired.userId, password: expired.initialPassword, deviceFingerprint: "x" }).catch((e: { reason?: string }) => e.reason);
    expect(expiredAnswer).toBe("User ID or password is incorrect");
  });

  it("does not allow a deactivated account back, and refuses an administrator changing their own state", async () => {
    const tenant = randomUUID();
    const admin = await administrator(tenant);
    const u = await createUser(app, admin, { companyCode: "ACME", personType: "internal", personRef: "EMP-11", displayName: "Nina Pillai", reason: REASON });
    await setState(app, admin, { userId: u.userId, to: "deactivated", reason: "Left the company" });
    await expectRefused(setState(app, admin, { userId: u.userId, to: "active", reason: "Trying to reactivate directly" }), "VALIDATION_FAILED");
    await expectRefused(setState(app, admin, { userId: admin.userId, to: "suspended", reason: "Suspending myself by mistake" }), "MAKER_CHECKER_REQUIRED");
  });

  it("changes a password only with the current one, refuses weak and recently used ones, and ends the other sessions", async () => {
    const tenant = randomUUID();
    const admin = await administrator(tenant);
    const u = await createUser(app, admin, { companyCode: "ACME", personType: "internal", personRef: "EMP-12", displayName: "Om Prakash", reason: REASON });
    const kept = await signIn(app, keys, { tenantId: tenant, userId: u.userId, password: u.initialPassword, deviceFingerprint: "desk" });
    const other = await signIn(app, keys, { tenantId: tenant, userId: u.userId, password: u.initialPassword, deviceFingerprint: "phone" });
    const me = contextFor(tenant, u.userId);
    await expectRefused(changePassword(app, me, { current: "not the current one", next: "a brand new quiet phrase 9" }), "FORBIDDEN");
    await expectRefused(changePassword(app, me, { current: u.initialPassword, next: "password1234 weak" }), "VALIDATION_FAILED");
    await expectRefused(changePassword(app, me, { current: u.initialPassword, next: u.initialPassword }), "VALIDATION_FAILED");
    await changePassword(app, me, { current: u.initialPassword, next: "a brand new quiet phrase 9", keepSessionId: kept.sessionId });
    expect(await mustChangePassword(app, tenant, u.userId)).toBe(false);
    await expectRefused(verifyAccess(app, keys, { tenantId: tenant, accessToken: other.accessToken }), "FORBIDDEN");
    expect(await verifyAccess(app, keys, { tenantId: tenant, accessToken: kept.accessToken })).toMatchObject({ userRef: u.userId });
    await expectRefused(changePassword(app, me, { current: "a brand new quiet phrase 9", next: u.initialPassword }), "VALIDATION_FAILED", "recently");
    void refreshSession;
  });
});
