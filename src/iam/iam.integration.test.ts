// Permission engine acceptance tests (Part 07 S2). Run against the test database; skipped without it.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { can, dataScope } from "./pdp";
import { approveAssignment, approveRoleGrant, createRole, proposeAssignment, proposeRoleGrant, registerPermissions } from "./roles";
import { approveLimit, mayApprove, proposeLimit } from "./authority";
import { maskFields } from "./masking";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const REASON = "Access needed for the project purchasing work";

function contextFor(tenantId: string, userId: string = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

async function expectRefused(work: Promise<unknown>, code: string, text?: string): Promise<void> {
  const error = await work.then(
    () => null,
    (e: { code?: string; reason?: string; message?: string }) => e,
  );
  expect(error, "expected the action to be refused").not.toBeNull();
  expect(error).toMatchObject({ code });
  if (text) expect(`${(error as { reason?: string }).reason ?? ""} ${(error as { message?: string }).message ?? ""}`).toContain(text);
}

describe.skipIf(!TEST_URL || !APP_URL)("permission engine (Part 07 S2)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-iamtest" });
    app = createPool(APP_URL!, { application_name: "erp-iamtest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [
      { key: "procurement.po.approve", module: "procurement", description: "Approve purchase orders", stage: "APPROVE" },
      { key: "procurement.po.create", module: "procurement", description: "Create purchase orders", stage: "PLAN" },
      { key: "iam.role.manage", module: "iam", description: "Manage roles and role grants", stage: "APPROVE", sensitivity: "privileged" },
      { key: "iam.assignment.create", module: "iam", description: "Assign roles within own scope", stage: "APPROVE", sensitivity: "privileged" },
      { key: "payroll.salary.view", module: "payroll", description: "View salary", stage: "RECORD", sensitivity: "sensitive" },
    ]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** Bootstrap: the first administrator is written directly, since nothing else can grant the first permission. */
  async function bootstrapAdmin(tenant: string, userId: string, keys: string[]): Promise<void> {
    await withTransaction(
      owner,
      async (c) => {
        const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'Admin', 'bootstrap') RETURNING id", [tenant, `admin_${randomUUID().slice(0, 8)}`]);
        for (const key of keys) {
          await c.query(
            "INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, $3, 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap administrator grant')",
            [tenant, role.rows[0].id, key],
          );
        }
        await c.query(
          "INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap administrator assignment')",
          [tenant, userId, role.rows[0].id],
        );
      },
      { tenantId: tenant },
    );
  }

  it("refuses an unregistered permission and a person with no grant (deny by default)", async () => {
    const tenant = randomUUID();
    const user = contextFor(tenant);
    expect(await can(app, user, "made.up.key")).toMatchObject({ allowed: false, reason: expect.stringContaining("not a registered permission") });
    expect((await can(app, user, "procurement.po.approve")).allowed).toBe(false);
  });

  it("makes a role grant effective only after a second person approves it", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId, ["iam.role.manage", "iam.assignment.create"]);
    const role = await createRole(app, admin, { code: "buyer", name: "Buyer" });
    const grant = await proposeRoleGrant(app, admin, { roleId: role.id, permissionKey: "procurement.po.approve", effect: "allow", reason: REASON });
    const checker = contextFor(tenant);
    await bootstrapAdmin(tenant, checker.userId, ["iam.role.manage"]);
    await expectRefused(approveRoleGrant(app, admin, grant.id, "Approving my own grant"), "MAKER_CHECKER_REQUIRED");
    await approveRoleGrant(app, checker, grant.id, "Checked against the purchasing policy");
    const user = contextFor(tenant);
    const assignment = await proposeAssignment(app, admin, { userRef: user.userId, roleId: role.id, scopeType: "tenant", validFrom: "2026-01-01", reason: REASON });
    expect((await can(app, user, "procurement.po.approve")).allowed).toBe(false);
    await approveAssignment(app, checker, assignment.id, "Checked against the joiner record");
    expect(await can(app, user, "procurement.po.approve")).toMatchObject({ allowed: true, source: { roleCode: "buyer" } });
  });

  it("lets a deny held at one project beat a tenant-wide allow held through another role", async () => {
    // Denies are scoped by the assignment that carries them: a deny role assigned at project P-PUNE blocks only that project.
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId, ["iam.role.manage", "iam.assignment.create"]);
    const approverRole = await createRole(app, admin, { code: "approver", name: "Approver" });
    const freezeRole = await createRole(app, admin, { code: "pune_freeze", name: "Pune approval freeze" });
    const allow = await proposeRoleGrant(app, admin, { roleId: approverRole.id, permissionKey: "procurement.po.approve", effect: "allow", reason: REASON });
    const deny = await proposeRoleGrant(app, admin, { roleId: freezeRole.id, permissionKey: "procurement.po.approve", effect: "deny", reason: "No approvals on the Pune project" });
    const checker = contextFor(tenant);
    await bootstrapAdmin(tenant, checker.userId, ["iam.role.manage"]);
    await approveRoleGrant(app, checker, allow.id, "Checked against the purchasing policy");
    await approveRoleGrant(app, checker, deny.id, "Checked against the segregation rules");
    const user = contextFor(tenant);
    const a = await proposeAssignment(app, admin, { userRef: user.userId, roleId: approverRole.id, scopeType: "tenant", validFrom: "2026-01-01", reason: REASON });
    const d = await proposeAssignment(app, admin, { userRef: user.userId, roleId: freezeRole.id, scopeType: "project", scopeId: "P-PUNE", validFrom: "2026-01-01", reason: REASON, scopeResource: { projectId: "P-PUNE" } });
    await approveAssignment(app, checker, a.id, "Checked against the joiner record");
    await approveAssignment(app, checker, d.id, "Checked against the joiner record");
    expect(await can(app, user, "procurement.po.approve", { projectId: "P-PUNE" })).toMatchObject({ allowed: false, reason: expect.stringContaining("explicitly denied") });
    expect((await can(app, user, "procurement.po.approve", { projectId: "P-KOLKATA" })).allowed).toBe(true);
  });

  it("refuses an assignment outside the assigner's own scope", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId, ["iam.role.manage"]);
    // A project-level assigner: may assign only at project P1.
    const limited = contextFor(tenant);
    await withTransaction(
      owner,
      async (c) => {
        const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, 'project_admin', 'Project admin', 'bootstrap') RETURNING id", [tenant]);
        await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, 'iam.assignment.create', 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap project admin grant')", [tenant, role.rows[0].id]);
        await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, scope_id, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'project', 'P1', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap project admin assignment')", [tenant, limited.userId, role.rows[0].id]);
      },
      { tenantId: tenant },
    );
    const role = await createRole(app, admin, { code: "clerk", name: "Clerk" });
    await expectRefused(proposeAssignment(app, limited, { userRef: randomUUID(), roleId: role.id, scopeType: "tenant", validFrom: "2026-01-01", reason: REASON }), "FORBIDDEN");
    const ok = await proposeAssignment(app, limited, { userRef: randomUUID(), roleId: role.id, scopeType: "project", scopeId: "P1", validFrom: "2026-01-01", reason: REASON, scopeResource: { projectId: "P1" } });
    expect(ok.id).toBeGreaterThan(0);
  });

  it("applies an amount condition to an approval", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId, ["iam.role.manage", "iam.assignment.create"]);
    const role = await createRole(app, admin, { code: "po_approver", name: "PO approver" });
    const grant = await proposeRoleGrant(app, admin, { roleId: role.id, permissionKey: "procurement.po.approve", effect: "allow", conditions: { maxAmountPaise: 10_000_000 }, reason: REASON });
    const checker = contextFor(tenant);
    await bootstrapAdmin(tenant, checker.userId, ["iam.role.manage"]);
    await approveRoleGrant(app, checker, grant.id, "Checked against the purchasing policy");
    const user = contextFor(tenant);
    const a = await proposeAssignment(app, admin, { userRef: user.userId, roleId: role.id, scopeType: "tenant", validFrom: "2026-01-01", reason: REASON });
    await approveAssignment(app, checker, a.id, "Checked against the joiner record");
    expect((await can(app, user, "procurement.po.approve", { attributes: { amountPaise: 5_000_000 } })).allowed).toBe(true);
    expect((await can(app, user, "procurement.po.approve", { attributes: { amountPaise: 20_000_000 } })).allowed).toBe(false);
  });

  it("gives a list only the projects the person may see", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId, ["iam.role.manage", "iam.assignment.create"]);
    const role = await createRole(app, admin, { code: "site_viewer", name: "Site viewer" });
    const checker = contextFor(tenant);
    await bootstrapAdmin(tenant, checker.userId, ["iam.role.manage"]);
    const g1 = await proposeRoleGrant(app, admin, { roleId: role.id, permissionKey: "procurement.po.create", effect: "allow", reason: REASON });
    await approveRoleGrant(app, checker, g1.id, "Checked against the purchasing policy");
    const user = contextFor(tenant);
    const p1 = await proposeAssignment(app, admin, { userRef: user.userId, roleId: role.id, scopeType: "project", scopeId: "P1", validFrom: "2026-01-01", reason: REASON, scopeResource: { projectId: "P1" } });
    const p2 = await proposeAssignment(app, admin, { userRef: user.userId, roleId: role.id, scopeType: "project", scopeId: "P2", validFrom: "2026-01-01", reason: REASON, scopeResource: { projectId: "P2" } });
    await approveAssignment(app, checker, p1.id, "Checked against the joiner record");
    await approveAssignment(app, checker, p2.id, "Checked against the joiner record");
    const scope = await dataScope(app, user, "procurement.po.create");
    expect(scope.projects).toEqual({ all: false, ids: ["P1", "P2"], excluded: [] });
    expect(scope.companies.all).toBe(false);
  });

  it("removes a sensitive field from the payload for a viewer without the permission", async () => {
    const tenant = randomUUID();
    await withTransaction(owner, (c) => c.query("INSERT INTO iam_field_policies (entity_type, field_name, view_permission_key, mask_type) VALUES ('employee', 'salary', 'payroll.salary.view', 'full'), ('employee', 'pan', 'payroll.salary.view', 'partial')"), { tenantId: tenant });
    const viewer = contextFor(tenant);
    const masked = await maskFields(app, viewer, "employee", { name: "A. Kumar", salary: 90000, pan: "ABCDE1234F" });
    expect(masked).toEqual({ name: "A. Kumar", pan: "******234F" });
  });

  it("refuses an approval with no limit, and applies the most specific limit", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId, ["iam.role.manage"]);
    const approver = contextFor(tenant);
    const general = await proposeLimit(app, admin, { userRef: approver.userId, docType: "purchase_order", maxAmountPaise: 5_000_000, validFrom: "2026-01-01", reason: REASON });
    await approveLimit(app, approver, general.id, "Checked against the delegation of authority");
    expect(await mayApprove(app, approver, { userRef: approver.userId, docType: "work_order", amountPaise: 1, at: "2026-10-20" })).toEqual({ allowed: false, limitPaise: null });
    expect((await mayApprove(app, approver, { userRef: approver.userId, docType: "purchase_order", amountPaise: 4_000_000, at: "2026-10-20" })).allowed).toBe(true);
    const specific = await proposeLimit(app, admin, { userRef: approver.userId, docType: "purchase_order", projectId: null, category: "cement", maxAmountPaise: 1_000_000, validFrom: "2026-01-01", reason: REASON });
    await approveLimit(app, approver, specific.id, "Checked against the delegation of authority");
    expect((await mayApprove(app, approver, { userRef: approver.userId, docType: "purchase_order", category: "cement", amountPaise: 2_000_000, at: "2026-10-20" })).limitPaise).toBe(1_000_000);
  });

  it("keeps one tenant's grants away from another tenant", async () => {
    const a = randomUUID();
    const adminA = contextFor(a);
    await bootstrapAdmin(a, adminA.userId, ["iam.role.manage", "iam.assignment.create"]);
    const role = await createRole(app, adminA, { code: "shared_name", name: "Shared" });
    const outsider = contextFor(randomUUID(), adminA.userId);
    expect((await can(app, outsider, "iam.role.manage")).allowed).toBe(false);
    expect(role.id).toBeGreaterThan(0);
  });
});
