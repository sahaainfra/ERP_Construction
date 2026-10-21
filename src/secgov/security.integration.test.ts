// Security event acceptance tests (Part 08 S2). Run against the test database; skipped without it.
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
import { createCredentials, login, refreshSession, type Keys } from "../iam/auth";
import { changeStatus, detect, listEvents, loginHistory, SECURITY_PERMISSIONS } from "./security";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const PASSWORD = "a long quiet passphrase 1";

function contextFor(tenantId: string, userId: string = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

async function expectRefused(work: Promise<unknown>, code: string): Promise<void> {
  const error = await work.then(() => null, (e: { code?: string }) => e);
  expect(error, "expected the action to be refused").not.toBeNull();
  expect(error).toMatchObject({ code });
}

describe.skipIf(!TEST_URL || !APP_URL)("security events (Part 08 S2)", () => {
  let owner: Pool;
  let app: Pool;
  const keys: Keys = { tokenKey: randomBytes(32), mfaKey: randomBytes(32) };

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-sectest" });
    app = createPool(APP_URL!, { application_name: "erp-sectest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [...SECURITY_PERMISSIONS]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** An administrator with the security permissions, written directly as a bootstrap. */
  async function securityAdmin(tenant: string): Promise<RequestContext> {
    const ctx = contextFor(tenant);
    await withTransaction(
      owner,
      async (c) => {
        const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'Security', 'bootstrap') RETURNING id", [tenant, `sec_${randomUUID().slice(0, 8)}`]);
        for (const key of ["secgov.security.view", "secgov.security.manage"]) {
          await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, $3, 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap security grant')", [tenant, role.rows[0].id, key]);
        }
        await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap security assignment')", [tenant, ctx.userId, role.rows[0].id]);
      },
      { tenantId: tenant },
    );
    return ctx;
  }

  it("raises a brute-force event once for repeated failures, and a lockout event when the account locks", async () => {
    const tenant = randomUUID();
    const admin = await securityAdmin(tenant);
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    for (let i = 0; i < 5; i++) await expect(login(app, keys, { tenantId: tenant, userRef: user, password: "wrong passphrase here", deviceFingerprint: "attacker-1" })).rejects.toThrow();
    await expect(login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "attacker-1" })).rejects.toThrow();
    expect(await detect(app, admin)).toBe(2);
    expect(await detect(app, admin)).toBe(0);
    const events = await listEvents(app, admin);
    expect(events.map((e) => e.rule).sort()).toEqual(["BRUTE_FORCE", "LOCKOUT"]);
    expect(events.find((e) => e.rule === "BRUTE_FORCE")).toMatchObject({ severity: "high", status: "open", subject: user });
  });

  it("raises a critical token-reuse event when a refresh token is presented twice", async () => {
    const tenant = randomUUID();
    const admin = await securityAdmin(tenant);
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    const first = await login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "laptop-9" });
    await refreshSession(app, keys, { tenantId: tenant, refreshToken: first.refreshToken });
    await expectRefused(refreshSession(app, keys, { tenantId: tenant, refreshToken: first.refreshToken }), "FORBIDDEN");
    await detect(app, admin);
    const events = await listEvents(app, admin);
    expect(events).toContainEqual(expect.objectContaining({ rule: "TOKEN_REUSE", severity: "critical", subject: user }));
  });

  it("raises a spray event when one device fails for many accounts", async () => {
    const tenant = randomUUID();
    const admin = await securityAdmin(tenant);
    for (let i = 0; i < 10; i++) {
      const u = randomUUID();
      await createCredentials(app, tenant, u, PASSWORD);
      await expect(login(app, keys, { tenantId: tenant, userRef: u, password: "wrong passphrase here", deviceFingerprint: "shared-kiosk" })).rejects.toThrow();
    }
    await detect(app, admin);
    expect((await listEvents(app, admin)).map((e) => e.rule)).toContain("SPRAY");
  });

  it("moves an event OPEN → ACKNOWLEDGED → RESOLVED, needs a reason to close, and refuses moves out of a closed state", async () => {
    const tenant = randomUUID();
    const admin = await securityAdmin(tenant);
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    for (let i = 0; i < 5; i++) await expect(login(app, keys, { tenantId: tenant, userRef: user, password: "wrong passphrase here", deviceFingerprint: "x-1" })).rejects.toThrow();
    await detect(app, admin);
    const brute = (await listEvents(app, admin)).find((e) => e.rule === "BRUTE_FORCE");
    if (!brute) throw new Error("expected a brute-force event");
    await changeStatus(app, admin, { eventId: brute.id, to: "acknowledged" });
    await expectRefused(changeStatus(app, admin, { eventId: brute.id, to: "resolved" }), "VALIDATION_FAILED");
    await changeStatus(app, admin, { eventId: brute.id, to: "resolved", reason: "Owner confirmed a mistyped password and reset it" });
    expect((await listEvents(app, admin, { status: "resolved" })).map((e) => e.id)).toContain(brute.id);
    await expectRefused(changeStatus(app, admin, { eventId: brute.id, to: "acknowledged" }), "VALIDATION_FAILED");
  });

  it("refuses the event list to a person without the view permission, and lets a person read only their own login history", async () => {
    const tenant = randomUUID();
    const admin = await securityAdmin(tenant);
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    await login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "phone-2" });
    const outsider = contextFor(tenant);
    await expectRefused(listEvents(app, outsider), "FORBIDDEN");
    expect((await loginHistory(app, contextFor(tenant, user), user))[0]).toMatchObject({ outcome: "success" });
    await expectRefused(loginHistory(app, outsider, user), "FORBIDDEN");
    expect((await loginHistory(app, admin, user)).length).toBe(1);
  });

  it("keeps one tenant's events invisible to another", async () => {
    const a = randomUUID();
    const adminA = await securityAdmin(a);
    const user = randomUUID();
    await createCredentials(app, a, user, PASSWORD);
    for (let i = 0; i < 5; i++) await expect(login(app, keys, { tenantId: a, userRef: user, password: "wrong passphrase here", deviceFingerprint: "y-1" })).rejects.toThrow();
    await detect(app, adminA);
    const adminB = await securityAdmin(randomUUID());
    expect(await listEvents(app, adminB)).toEqual([]);
  });
});
