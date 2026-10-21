// Part 12 S1 database tests: a failing brand is refused and not stored, the proposer cannot approve, approval makes the brand active,
// a new approval supersedes the old one, and one tenant's brand is not another's.
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
import { BRANDING_PERMISSIONS, proposeBranding, approveBranding, activeBranding } from "./branding";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const REASON = "Brand from the client letter of 19 October";

function contextFor(tenantId: string, userId: string = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomBytes(4).toString("hex")}`,
  );
}

describe.skipIf(!TEST_URL || !APP_URL)("tenant branding (Part 12 S1)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-designtest" });
    app = createPool(APP_URL!, { application_name: "erp-designtest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [...BRANDING_PERMISSIONS]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  async function grant(tenant: string, userId: string, keys: string[]): Promise<RequestContext> {
    await withTransaction(owner, async (c) => {
      const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'Brand administrator', 'bootstrap') RETURNING id", [tenant, `brand_${randomUUID().slice(0, 8)}`]);
      for (const key of keys) {
        await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, $3, 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap branding grant')", [tenant, role.rows[0].id, key]);
      }
      await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap branding assignment')", [tenant, userId, role.rows[0].id]);
    }, { tenantId: tenant });
    return contextFor(tenant, userId);
  }

  function inTenant<T>(tenant: string, query: (client: PoolClient) => Promise<T>): Promise<T> {
    return withTransaction(owner, query, { tenantId: tenant });
  }

  it("refuses a brand that fails the contrast check and stores nothing", async () => {
    const tenant = randomUUID();
    const proposer = await grant(tenant, randomUUID(), ["ui.branding.manage"]);
    await expect(proposeBranding(app, proposer, { primary: "#F3F5F7", accent: "#FFFFFF", reason: REASON })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const rows = await inTenant(tenant, (c) => c.query("SELECT 1 FROM ui_branding"));
    expect(rows.rowCount).toBe(0);
  });

  it("stores a passing proposal, refuses approval by its proposer, and makes it active when someone else approves", async () => {
    const tenant = randomUUID();
    // The proposer holds both rights, so the refusal below is the maker-checker rule and not a missing permission.
    const proposer = await grant(tenant, randomUUID(), ["ui.branding.manage", "ui.branding.approve"]);
    const approver = await grant(tenant, randomUUID(), ["ui.branding.approve"]);
    const { version, report } = await proposeBranding(app, proposer, { primary: "#1D5BA6", accent: "#8A5A00", logoRef: "logo-acme", reason: REASON });
    expect(version).toBe(1);
    expect(report.pass).toBe(true);
    expect(await activeBranding(app, tenant)).toBeNull();
    await expect(approveBranding(app, proposer, { version, reason: "Approving my own brand" })).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    await approveBranding(app, approver, { version, reason: "Checked against the client letter" });
    expect(await activeBranding(app, tenant)).toEqual({ version: 1, primary: "#1D5BA6", accent: "#8A5A00", logoRef: "logo-acme" });
  });

  it("supersedes the active brand with a new approval, leaving one active version", async () => {
    const tenant = randomUUID();
    const proposer = await grant(tenant, randomUUID(), ["ui.branding.manage"]);
    const approver = await grant(tenant, randomUUID(), ["ui.branding.approve"]);
    const first = await proposeBranding(app, proposer, { primary: "#1D5BA6", accent: "#8A5A00", reason: REASON });
    await approveBranding(app, approver, { version: first.version, reason: "First brand approved" });
    const second = await proposeBranding(app, proposer, { primary: "#7A5200", accent: "#8A5A00", reason: "Refreshed brand for the pilot" });
    await approveBranding(app, approver, { version: second.version, reason: "Refreshed brand approved" });
    const statuses = await inTenant(tenant, (c) => c.query<{ version: number; status: string }>("SELECT version, status FROM ui_branding ORDER BY version"));
    expect(statuses.rows).toEqual([{ version: 1, status: "superseded" }, { version: 2, status: "active" }]);
    expect((await activeBranding(app, tenant))?.primary).toBe("#7A5200");
  });

  it("refuses a user without the branding permission, and keeps one tenant's brand from another", async () => {
    const tenant = randomUUID();
    const proposer = await grant(tenant, randomUUID(), ["ui.branding.manage"]);
    const approver = await grant(tenant, randomUUID(), ["ui.branding.approve"]);
    const { version } = await proposeBranding(app, proposer, { primary: "#1D5BA6", accent: "#8A5A00", reason: REASON });
    await approveBranding(app, approver, { version, reason: "Approved for this tenant" });
    await expect(proposeBranding(app, contextFor(tenant), { primary: "#1D5BA6", accent: "#8A5A00", reason: REASON })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await activeBranding(app, randomUUID())).toBeNull();
  });
});
