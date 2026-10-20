// Segregation-of-duties acceptance tests (Part 07 S3). Run against the test database; skipped without it.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { registerPermissions } from "./roles";
import { approveException, approveRule, detectiveScan, linkActor, openFindings, proposeException, proposeRule, recordAction, resolveFinding, seedRules, setEnforcement } from "./sod";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

function contextFor(tenantId: string, userId: string = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

async function expectRefused(work: Promise<unknown>, code: string): Promise<void> {
  const error = await work.then(
    () => null,
    (e: { code?: string }) => e,
  );
  expect(error, "expected the action to be refused").not.toBeNull();
  expect(error).toMatchObject({ code });
}

describe.skipIf(!TEST_URL || !APP_URL)("segregation of duties (Part 07 S3)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-sodtest" });
    app = createPool(APP_URL!, { application_name: "erp-sodtest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [{ key: "iam.sod.manage", module: "iam", description: "Manage segregation-of-duties rules", stage: "APPROVE", sensitivity: "privileged" }]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** Bootstrap: an administrator with the SoD permission, written directly (nothing else can grant the first permission). */
  async function bootstrapAdmin(tenant: string, userId: string): Promise<void> {
    await withTransaction(
      owner,
      async (c) => {
        const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'SoD admin', 'bootstrap') RETURNING id", [tenant, `sod_admin_${randomUUID().slice(0, 8)}`]);
        await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, 'iam.sod.manage', 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap SoD administrator grant')", [tenant, role.rows[0].id]);
        await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap SoD administrator assignment')", [tenant, userId, role.rows[0].id]);
      },
      { tenantId: tenant },
    );
  }

  /** A rule approved to observe, or to enforce by a third person. */
  async function ruleAt(tenant: string, admin: RequestContext, code: string, to: "observe" | "enforce") {
    const id = await withTransaction(app, (c) => c.query<{ id: string }>("SELECT id FROM iam_sod_rules WHERE rule_code = $1", [code]), { tenantId: tenant }).then((r) => Number(r.rows[0].id));
    const approver = contextFor(tenant);
    await approveRule(app, approver, id, "Checked against the authority matrix");
    if (to === "enforce") await setEnforcement(app, contextFor(tenant), id, "enforce", "Enforced after the observation period");
    void admin;
    return id;
  }

  it("seeds the sixteen rules as drafts, and a draft changes nothing", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId);
    expect(await seedRules(app, admin)).toBe(16);
    expect(await seedRules(app, admin)).toBe(0);
    const person = randomUUID();
    await recordAction(app, contextFor(tenant, person), { actionKey: "purchase.order.create", entityType: "po", entityId: "PO-DRAFT" });
    const { violations } = await recordAction(app, contextFor(tenant, person), { actionKey: "purchase.order.approve", entityType: "po", entityId: "PO-DRAFT" });
    expect(violations).toEqual([]);
  });

  it("observes a conflict without blocking it, and records a finding", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId);
    await seedRules(app, admin);
    await ruleAt(tenant, admin, "PO_CREATE_APPROVE", "observe");
    const maker = randomUUID();
    await recordAction(app, contextFor(tenant, maker), { actionKey: "purchase.order.create", entityType: "po", entityId: "PO-OBS" });
    const { violations } = await recordAction(app, contextFor(tenant, maker), { actionKey: "purchase.order.approve", entityType: "po", entityId: "PO-OBS" });
    expect(violations).toEqual([expect.objectContaining({ ruleCode: "PO_CREATE_APPROVE", enforcement: "observe", covered: false })]);
    expect(await openFindings(app, admin)).toBe(1);
  });

  it("refuses an enforced conflict as CP-IAM-02 BLOCK, and needs a third person to enforce", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId);
    await seedRules(app, admin);
    const id = await withTransaction(app, (c) => c.query<{ id: string }>("SELECT id FROM iam_sod_rules WHERE rule_code = 'PO_CREATE_APPROVE'"), { tenantId: tenant }).then((r) => Number(r.rows[0].id));
    const checker = contextFor(tenant);
    await approveRule(app, checker, id, "Checked against the authority matrix");
    await expectRefused(setEnforcement(app, checker, id, "enforce", "The approver tries to enforce"), "MAKER_CHECKER_REQUIRED");
    await setEnforcement(app, contextFor(tenant), id, "enforce", "Enforced after the observation period");
    const maker = randomUUID();
    await recordAction(app, contextFor(tenant, maker), { actionKey: "purchase.order.create", entityType: "po", entityId: "PO-BLK" });
    await expectRefused(recordAction(app, contextFor(tenant, maker), { actionKey: "purchase.order.approve", entityType: "po", entityId: "PO-BLK" }), "PROTOCOL_BLOCKED");
    const block = await withTransaction(app, (c) => c.query("SELECT 1 FROM core_protocol_evaluations WHERE cp_code = 'CP-IAM-02' AND result = 'BLOCK'"), { tenantId: tenant });
    expect(block.rowCount).toBe(1);
  });

  it("treats two accounts of one employee as one actor", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId);
    await seedRules(app, admin);
    await ruleAt(tenant, admin, "PO_CREATE_APPROVE", "enforce");
    const personAccount1 = randomUUID();
    const personAccount2 = randomUUID();
    await linkActor(app, admin, personAccount1, "EMP-1001");
    await linkActor(app, admin, personAccount2, "EMP-1001");
    await recordAction(app, contextFor(tenant, personAccount1), { actionKey: "purchase.order.create", entityType: "po", entityId: "PO-LINK" });
    await expectRefused(recordAction(app, contextFor(tenant, personAccount2), { actionKey: "purchase.order.approve", entityType: "po", entityId: "PO-LINK" }), "PROTOCOL_BLOCKED");
  });

  it("covers a conflict with an approved exception, but not for a rule that forbids exceptions", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId);
    await seedRules(app, admin);
    await ruleAt(tenant, admin, "PO_CREATE_APPROVE", "enforce");
    const payId = await withTransaction(app, (c) => c.query<{ id: string }>("SELECT id FROM iam_sod_rules WHERE rule_code = 'PAY_MAKE_APPROVE'"), { tenantId: tenant }).then((r) => Number(r.rows[0].id));
    const person = randomUUID();
    const ruleId = await withTransaction(app, (c) => c.query<{ id: string }>("SELECT id FROM iam_sod_rules WHERE rule_code = 'PO_CREATE_APPROVE'"), { tenantId: tenant }).then((r) => Number(r.rows[0].id));
    await expectRefused(
      proposeException(app, admin, { ruleId: payId, personRef: person, reason: "A small site with one store keeper", compensatingControl: "Monthly review by the finance controller", validFrom: "2026-10-20", validTo: "2026-11-20" }),
      "PROTOCOL_BLOCKED",
    );
    await expectRefused(
      proposeException(app, admin, { ruleId, personRef: person, reason: "A small site with one store keeper", compensatingControl: "Monthly review by the finance controller", validFrom: "2026-10-20", validTo: "2027-06-30" }),
      "VALIDATION_FAILED",
    );
    const ex = await proposeException(app, admin, { ruleId, personRef: person, reason: "A small site with one store keeper", compensatingControl: "Monthly review by the finance controller", validFrom: "2026-10-20", validTo: "2026-11-20" });
    await expectRefused(approveException(app, admin, ex.id), "MAKER_CHECKER_REQUIRED");
    await approveException(app, contextFor(tenant), ex.id);
    await recordAction(app, contextFor(tenant, person), { actionKey: "purchase.order.create", entityType: "po", entityId: "PO-EXC" });
    const { violations } = await recordAction(app, contextFor(tenant, person), { actionKey: "purchase.order.approve", entityType: "po", entityId: "PO-EXC" });
    expect(violations).toEqual([expect.objectContaining({ ruleCode: "PO_CREATE_APPROVE", covered: true })]);
  });

  it("lets only one of two conflicting actions through when they race on the same record", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId);
    await seedRules(app, admin);
    await ruleAt(tenant, admin, "PR_CREATE_APPROVE", "enforce");
    const person = randomUUID();
    const results = await Promise.allSettled([
      recordAction(app, contextFor(tenant, person), { actionKey: "purchase.requisition.create", entityType: "pr", entityId: "PR-RACE" }),
      recordAction(app, contextFor(tenant, person), { actionKey: "purchase.requisition.approve", entityType: "pr", entityId: "PR-RACE" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("finds past conflicts in the detective scan once, and clears a finding when it is resolved", async () => {
    const tenant = randomUUID();
    const admin = contextFor(tenant);
    await bootstrapAdmin(tenant, admin.userId);
    await seedRules(app, admin);
    const person = randomUUID();
    // History written before the rule was active.
    await withTransaction(
      owner,
      async (c) => {
        await c.query("INSERT INTO iam_action_log (tenant_id, actor_ref, action_key, entity_type, entity_id, correlation_id) VALUES ($1, $2, 'purchase.order.create', 'po', 'PO-OLD', 'legacy-1'), ($1, $2, 'purchase.order.approve', 'po', 'PO-OLD', 'legacy-2')", [tenant, person]);
      },
      { tenantId: tenant },
    );
    await ruleAt(tenant, admin, "PO_CREATE_APPROVE", "observe");
    expect(await detectiveScan(app, admin)).toBe(1);
    expect(await detectiveScan(app, admin)).toBe(0);
    expect(await openFindings(app, admin)).toBe(1);
    const ruleId = await withTransaction(app, (c) => c.query<{ id: string }>("SELECT id FROM iam_sod_rules WHERE rule_code = 'PO_CREATE_APPROVE'"), { tenantId: tenant }).then((r) => Number(r.rows[0].id));
    await resolveFinding(app, admin, { ruleId, entityType: "po", entityId: "PO-OLD", personRef: person, reason: "Approved by the finance controller as a one-off" });
    expect(await openFindings(app, admin)).toBe(0);
    expect(await detectiveScan(app, admin)).toBe(1);
  });

  it("keeps one tenant's rules invisible to another", async () => {
    const a = randomUUID();
    const adminA = contextFor(a);
    await bootstrapAdmin(a, adminA.userId);
    await seedRules(app, adminA);
    const outsider = contextFor(randomUUID(), adminA.userId);
    await expectRefused(proposeRule(app, outsider, { code: "X_RULE", description: "An outsider's rule attempt", left: "a.b.c", right: "a.b.d", reason: "Attempt across tenants" }), "FORBIDDEN");
  });
});
