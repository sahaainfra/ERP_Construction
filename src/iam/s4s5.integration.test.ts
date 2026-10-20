// Part 07 S4–S5 acceptance tests: elevation, joiner/mover/leaver, access reviews, export controls, shadow comparisons, and the
// request pipeline. Run against the test database; skipped without it.
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { can } from "./pdp";
import { IAM_PERMISSIONS } from "./actors";
import { approveAssignment, approveRoleGrant, createRole, proposeRoleGrant, registerPermissions } from "./roles";
import { approveElevation, decideWithElevation, endElevation, isElevated, requestElevation } from "./privileged";
import { endAssignments, joinerAssignments, leaver, settlementGate } from "./jml";
import { closeReview, decideItem, expireUnreviewed, openReview, pendingCount } from "./reviews";
import { authorizeExport, setExportRule } from "./exports";
import { recordComparison, switchOverReady } from "./shadow";
import { base32Decode, totpAt } from "./crypto";
import { confirmTotp, createCredentials, enrolTotp, login } from "./auth";
import { runRoute } from "./pipeline";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const REASON = "Access needed for the project work";

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

describe.skipIf(!TEST_URL || !APP_URL)("Part 07 S4–S5", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-s45test" });
    app = createPool(APP_URL!, { application_name: "erp-s45test-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, IAM_PERMISSIONS);
    await registerPermissions(app, [
      { key: "iam.role.manage", module: "iam", description: "Manage roles and role grants", stage: "APPROVE", sensitivity: "privileged" },
      { key: "iam.assignment.create", module: "iam", description: "Assign roles within own scope", stage: "APPROVE", sensitivity: "privileged" },
      { key: "iam.access.revoke", module: "iam", description: "Revoke a person's access", stage: "CLOSE", sensitivity: "privileged" },
      { key: "iam.access.review", module: "iam", description: "Decide access reviews", stage: "RECONCILE", sensitivity: "sensitive" },
      { key: "iam.elevation.approve", module: "iam", description: "Approve privileged elevations", stage: "APPROVE", sensitivity: "privileged" },
      { key: "iam.export.manage", module: "iam", description: "Manage export rules", stage: "APPROVE", sensitivity: "privileged" },
      { key: "payroll.run.approve", module: "payroll", description: "Approve a payroll run", stage: "APPROVE", sensitivity: "privileged" },
      { key: "procurement.po.create", module: "procurement", description: "Create purchase orders", stage: "PLAN", sensitivity: "standard" },
      { key: "procurement.po.approve", module: "procurement", description: "Approve purchase orders", stage: "APPROVE", sensitivity: "standard" },
      { key: "reports.payroll.register", module: "reports", description: "Export the payroll register", stage: "RECORD", sensitivity: "sensitive" },
    ]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** Gives a person a role with the given permissions, held tenant-wide (or at one project). Written directly as a bootstrap. */
  async function grantRole(tenant: string, userId: string, keys: string[], scope: { type: "tenant" | "project"; id?: string } = { type: "tenant" }): Promise<void> {
    await withTransaction(
      owner,
      async (c) => {
        const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'Test role', 'bootstrap') RETURNING id", [tenant, `r_${randomUUID().slice(0, 8)}`]);
        for (const key of keys) {
          await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, $3, 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap test grant')", [tenant, role.rows[0].id, key]);
        }
        await c.query(
          "INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, scope_id, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, $4, $5, '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap test assignment')",
          [tenant, userId, role.rows[0].id, scope.type, scope.type === "tenant" ? null : scope.id],
        );
      },
      { tenantId: tenant },
    );
  }

  describe("privileged elevation (S4; CP-IAM-04)", () => {
    it("grants a privileged permission for a limited time after a second person approves, and ends it", async () => {
      const tenant = randomUUID();
      const requester = contextFor(tenant);
      const approver = contextFor(tenant);
      await grantRole(tenant, approver.userId, ["iam.elevation.approve"]);
      await expectRefused(requestElevation(app, requester, { permissionKey: "procurement.po.create", reason: "Trying a standard permission", hours: 1 }), "VALIDATION_FAILED", "privileged");
      await expectRefused(requestElevation(app, requester, { permissionKey: "payroll.run.approve", reason: "Needs the run approved today", hours: 5 }), "VALIDATION_FAILED", "1 to 4");
      const { id } = await requestElevation(app, requester, { permissionKey: "payroll.run.approve", reason: "Needs the run approved today", hours: 2 });
      expect((await decideWithElevation(app, requester, "payroll.run.approve")).allowed).toBe(false);
      await expectRefused(approveElevation(app, requester, id), "FORBIDDEN");
      await approveElevation(app, approver, id);
      expect(await decideWithElevation(app, requester, "payroll.run.approve")).toMatchObject({ allowed: true, via: "elevation" });
      await endElevation(app, requester, id);
      expect(await isElevated(app, requester, "payroll.run.approve")).toBe(false);
    });

    it("refuses a self-approval, and an elevation whose window has passed", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.elevation.approve"]);
      const { id } = await requestElevation(app, admin, { permissionKey: "payroll.run.approve", reason: "Self request attempt for the test", hours: 1 });
      await expectRefused(approveElevation(app, admin, id), "MAKER_CHECKER_REQUIRED");
      const other = contextFor(tenant);
      await grantRole(tenant, other.userId, ["iam.elevation.approve"]);
      await approveElevation(app, other, id);
      await withTransaction(owner, (c) => c.query("UPDATE iam_elevations SET expires_at = now() - interval '1 minute' WHERE id = $1", [id]), { tenantId: tenant });
      expect(await isElevated(app, admin, "payroll.run.approve")).toBe(false);
    });
  });

  describe("joiner, mover, leaver (S4; REQ-IAM-F18)", () => {
    it("revokes a leaver at once, rejects their pending grants, and holds settlement until it is done", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.role.manage", "iam.assignment.create", "procurement.po.create", "procurement.po.approve", "iam.access.revoke"]);
      const checker = contextFor(tenant);
      await grantRole(tenant, checker.userId, ["iam.assignment.create", "iam.role.manage", "iam.assignment.approve"]);
      const role = await createRole(app, admin, { code: "buyer_jml", name: "Buyer" });
      const grant = await proposeRoleGrant(app, admin, { roleId: role.id, permissionKey: "procurement.po.create", effect: "allow", reason: REASON });
      await approveRoleGrant(app, checker, grant.id, "Checked against the purchasing policy");
      const person = randomUUID();
      const [active] = await joinerAssignments(app, admin, { userRef: person, assignments: [{ userRef: person, roleId: role.id, scopeType: "tenant", validFrom: "2026-01-01", reason: REASON }] });
      await approveAssignment(app, checker, active, "Checked against the joiner record");
      const [pending] = await joinerAssignments(app, admin, { userRef: person, assignments: [{ userRef: person, roleId: role.id, scopeType: "tenant", validFrom: "2026-01-01", reason: REASON }] });
      expect((await can(app, contextFor(tenant, person), "procurement.po.create")).allowed).toBe(true);
      expect(await settlementGate(app, admin, person)).toMatchObject({ allowed: false, reason: "access is not revoked yet" });
      const result = await leaver(app, admin, { userRef: person, reason: "Resigned; last working day today" });
      expect(result).toEqual({ endedAssignments: 1, rejectedPending: 1 });
      expect((await can(app, contextFor(tenant, person), "procurement.po.create")).allowed).toBe(false);
      expect(await settlementGate(app, admin, person)).toMatchObject({ allowed: true });
      void pending;
    });

    it("ends a mover's old assignment from a date, without touching others", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.role.manage", "iam.assignment.create", "procurement.po.create", "procurement.po.approve", "iam.access.revoke"]);
      const role = await createRole(app, admin, { code: "site_eng", name: "Site engineer" });
      const person = randomUUID();
      const ids = await joinerAssignments(app, admin, { userRef: person, assignments: [
        { userRef: person, roleId: role.id, scopeType: "tenant", validFrom: "2026-01-01", reason: REASON },
      ] });
      expect(ids).toHaveLength(1);
      expect(await endAssignments(app, admin, { assignmentIds: ids, endOn: "2026-06-30", reason: "Moved to another project" })).toBe(0);
    });
  });

  describe("access certification (S4; CP-IAM-06)", () => {
    it("closes only at 100 % decisions, and expires what nobody decided after the grace period", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.role.manage", "iam.assignment.create", "procurement.po.create", "procurement.po.approve", "iam.access.review"]);
      const reviewer = contextFor(tenant);
      await grantRole(tenant, reviewer.userId, ["iam.access.review", "iam.assignment.approve", "iam.role.manage"]);
      const role = await createRole(app, admin, { code: "reviewed_role", name: "Reviewed" });
      const g = await proposeRoleGrant(app, admin, { roleId: role.id, permissionKey: "procurement.po.create", effect: "allow", reason: REASON });
      await approveRoleGrant(app, reviewer, g.id, "Checked against the purchasing policy");
      const u1 = randomUUID();
      const u2 = randomUUID();
      for (const u of [u1, u2]) {
        const [id] = await joinerAssignments(app, admin, { userRef: u, assignments: [{ userRef: u, roleId: role.id, scopeType: "project", scopeId: "P-REV", validFrom: "2026-01-01", reason: REASON }] });
        await approveAssignment(app, reviewer, id, "Checked against the joiner record");
      }
      const review = await openReview(app, admin, { scopeType: "project", scopeId: "P-REV", dueOn: "2026-01-01", graceDays: 0, reviewerRef: reviewer.userId });
      // Both project grants plus the administrator's tenant-wide grant (campaigns cover tenant-wide grants too).
      expect(review.items).toBe(3);
      const items = await withTransaction(app, (c) => c.query<{ id: string; user_ref: string }>("SELECT id, user_ref FROM iam_access_review_items WHERE review_id = $1 ORDER BY id", [review.id]), { tenantId: tenant });
      const itemOf = (user: string) => Number(items.rows.find((r) => r.user_ref === user)?.id);
      await expectRefused(decideItem(app, contextFor(tenant), itemOf(u1), "keep", "Not my item to decide here"), "FORBIDDEN");
      await decideItem(app, reviewer, itemOf(u1), "keep", "Still needed for the project");
      expect(await pendingCount(app, reviewer, review.id)).toBe(2);
      await expectRefused(closeReview(app, reviewer, review.id), "PROTOCOL_BLOCKED", "still need a decision");
      expect(await expireUnreviewed(app, reviewer, review.id, new Date("2026-06-01T00:00:00Z"))).toBe(2);
      expect((await can(app, contextFor(tenant, u2), "procurement.po.create", { projectId: "P-REV" })).allowed).toBe(false);
      await closeReview(app, reviewer, review.id);
    });

    it("refuses to expire a grant before its grace period has ended", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.access.review"]);
      const { id } = await openReview(app, admin, { scopeType: "company", scopeId: "CO-NONE", dueOn: "2099-01-01", reviewerRef: admin.userId });
      await expectRefused(expireUnreviewed(app, admin, id, new Date("2026-06-01T00:00:00Z")), "CONFLICT", "grace");
    });
  });

  describe("export controls (S4; REQ-IAM-F20)", () => {
    it("counts rows on the server, asks for a fresh second factor above a threshold, and denies above the limit", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.export.manage"]);
      await setExportRule(app, admin, { reportKey: "reports.payroll.register", permissionKey: "reports.payroll.register", maxRows: 10000, stepUpAboveRows: 1000 });
      const user = contextFor(tenant);
      await grantRole(tenant, user.userId, ["reports.payroll.register"]);
      // Two real sessions: one signed in with a password only, one after a second factor was verified.
      const keys = { tokenKey: randomBytes(32), mfaKey: randomBytes(32) };
      const password = "a long quiet passphrase 1";
      await createCredentials(app, tenant, user.userId, password);
      const plain = await login(app, keys, { tenantId: tenant, userRef: user.userId, password, deviceFingerprint: "laptop" });
      const { secret } = await enrolTotp(app, keys, tenant, user.userId);
      const raw = base32Decode(secret);
      const now = new Date();
      const step = Math.floor(now.getTime() / 1000 / 30);
      await confirmTotp(app, keys, tenant, user.userId, totpAt(raw, step), now);
      const later = new Date(now.getTime() + 60_000);
      const withMfa = await login(app, keys, { tenantId: tenant, userRef: user.userId, password, deviceFingerprint: "laptop", mfaCode: totpAt(raw, step + 2), now: later });
      const rows = (n: number) => async () => n;
      expect(await authorizeExport(app, user, { reportKey: "reports.payroll.register", count: rows(500), sessionId: plain.sessionId })).toMatchObject({ decision: "allowed" });
      const small = await authorizeExport(app, user, { reportKey: "reports.payroll.register", count: rows(500), sessionId: plain.sessionId });
      expect(small.watermark).toContain(user.userId);
      expect((await authorizeExport(app, user, { reportKey: "reports.payroll.register", count: rows(5000), sessionId: plain.sessionId })).decision).toBe("step_up_required");
      expect((await authorizeExport(app, user, { reportKey: "reports.payroll.register", count: rows(5000), sessionId: withMfa.sessionId })).decision).toBe("allowed");
      expect((await authorizeExport(app, user, { reportKey: "reports.payroll.register", count: rows(20000), sessionId: withMfa.sessionId })).decision).toBe("denied");
      expect((await authorizeExport(app, contextFor(tenant), { reportKey: "reports.payroll.register", count: rows(5), sessionId: null })).decision).toBe("denied");
      expect((await authorizeExport(app, user, { reportKey: "reports.unknown", count: rows(5), sessionId: withMfa.sessionId })).decision).toBe("denied");
    });
  });

  describe("review findings: guarantees that must hold (Part 07 independent review)", () => {
    it("an elevation never overrides an explicit deny", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.elevation.approve", "payroll.run.approve"]);
      const user = contextFor(tenant);
      const deny = await withTransaction(owner, async (c) => {
        const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, 'freeze_pay', 'Freeze', 'bootstrap') RETURNING id", [tenant]);
        await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, 'payroll.run.approve', 'deny', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap freeze')", [tenant, role.rows[0].id]);
        await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap freeze assignment')", [tenant, user.userId, role.rows[0].id]);
        return true;
      }, { tenantId: tenant });
      expect(deny).toBe(true);
      const { id } = await requestElevation(app, user, { permissionKey: "payroll.run.approve", reason: "Needs the run approved today", hours: 2 });
      await approveElevation(app, admin, id);
      expect(await decideWithElevation(app, user, "payroll.run.approve")).toMatchObject({ allowed: false, via: "none" });
    });

    it("a revoked person gets no decision, even through an elevation or a grant issued after the revocation", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.access.revoke", "procurement.po.create"]);
      const user = contextFor(tenant);
      await grantRole(tenant, user.userId, ["procurement.po.create"]);
      expect((await can(app, user, "procurement.po.create")).allowed).toBe(true);
      await leaver(app, admin, { userRef: user.userId, reason: "Left the company this week" });
      expect((await can(app, user, "procurement.po.create")).allowed).toBe(false);
    });

    it("refuses an approval by a person without the approval permission", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.role.manage", "iam.assignment.create"]);
      const role = await createRole(app, admin, { code: "unapproved_role", name: "Unapproved" });
      const g = await proposeRoleGrant(app, admin, { roleId: role.id, permissionKey: "procurement.po.create", effect: "allow", reason: REASON });
      await expectRefused(approveRoleGrant(app, contextFor(tenant), g.id, "Approving without any permission"), "FORBIDDEN");
    });

    it("refuses an approval by a second account of the requester", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.role.manage", "iam.assignment.create"]);
      const twin = contextFor(tenant);
      await grantRole(tenant, twin.userId, ["iam.role.manage"]);
      await withTransaction(app, (c) => c.query("INSERT INTO iam_actor_links (tenant_id, actor_ref, person_ref, linked_by) VALUES ($1, $2, 'EMP-42', 'hr'), ($1, $3, 'EMP-42', 'hr')", [tenant, admin.userId, twin.userId]), { tenantId: tenant });
      const role = await createRole(app, admin, { code: "twin_role", name: "Twin" });
      const g = await proposeRoleGrant(app, admin, { roleId: role.id, permissionKey: "procurement.po.create", effect: "allow", reason: REASON });
      await expectRefused(approveRoleGrant(app, twin, g.id, "Approving through a second account"), "MAKER_CHECKER_REQUIRED");
    });

    it("refuses a grant whose condition is malformed, so a deny cannot fail open", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      await grantRole(tenant, admin.userId, ["iam.role.manage"]);
      const role = await createRole(app, admin, { code: "bad_cond", name: "Bad condition" });
      await expectRefused(proposeRoleGrant(app, admin, { roleId: role.id, permissionKey: "procurement.po.create", effect: "deny", conditions: { statusIn: "draft" }, reason: REASON }), "VALIDATION_FAILED", "statusIn");
    });
  });

  describe("shadow mode (S4; REQ-IAM-F13)", () => {
    it("is ready for switch-over only with enough comparisons and no mismatch", async () => {
      const tenant = randomUUID();
      const admin = contextFor(tenant);
      for (let i = 0; i < 100; i++) await recordComparison(app, admin, { moduleCode: "procurement", actionKey: "procurement.po.create", legacyAllowed: true, engineAllowed: true });
      expect(await switchOverReady(app, admin, "procurement")).toMatchObject({ ready: true, mismatches: 0 });
      expect(await recordComparison(app, admin, { moduleCode: "procurement", actionKey: "procurement.po.create", legacyAllowed: true, engineAllowed: false })).toBe(false);
      expect(await switchOverReady(app, admin, "procurement")).toMatchObject({ ready: false, mismatches: 1 });
    });
  });

  describe("request pipeline (S5; REQ-IAM-F21)", () => {
    const spec = { name: "po.create", channel: "api" as const, permissionKey: "procurement.po.create", allowedFields: ["projectId", "title"], auditAction: "procurement.po.created" };

    it("refuses an unsigned-in call, an unknown field, and a caller without the permission; runs and audits an allowed one", async () => {
      const tenant = randomUUID();
      const user = contextFor(tenant);
      const handler = async () => ({ ok: true });
      await expectRefused(runRoute(app, null, spec, { projectId: "P1", title: "x" }, { correlationId: "c1", handler }), "FORBIDDEN", "not signed in");
      const session = { tenantId: tenant, companyId: user.companyId, userId: user.userId, sessionId: "s1" };
      await expectRefused(runRoute(app, session, spec, { projectId: "P1", title: "x" }, { correlationId: "c2", handler }), "FORBIDDEN");
      await grantRole(tenant, user.userId, ["procurement.po.create"], { type: "project", id: "P1" });
      const loadProject = async (input: { projectId?: unknown }) => ({ projectId: typeof input.projectId === "string" ? input.projectId : undefined });
      await expectRefused(runRoute(app, session, spec, { projectId: "P1", title: "x", price: 1 }, { correlationId: "c3", resource: loadProject, handler }), "VALIDATION_FAILED", "price");
      expect(await runRoute(app, session, spec, { projectId: "P1", title: "x" }, { correlationId: "c4", resource: loadProject, handler })).toEqual({ ok: true });
      const audit = await withTransaction(app, (c) => c.query("SELECT 1 FROM sec_audit_log WHERE action = 'procurement.po.created' AND correlation_id = 'c4'"), { tenantId: tenant });
      expect(audit.rowCount).toBe(1);
    });

    it("authorises the record the request names, not the scope the caller claims", async () => {
      const tenant = randomUUID();
      const user = contextFor(tenant);
      await grantRole(tenant, user.userId, ["procurement.po.create"], { type: "project", id: "P-OWN" });
      const session = { tenantId: tenant, companyId: user.companyId, userId: user.userId, sessionId: "s2" };
      const loadProject = async (input: { projectId?: unknown }) => ({ projectId: typeof input.projectId === "string" ? input.projectId : undefined });
      await expectRefused(runRoute(app, session, spec, { projectId: "P-OTHER", title: "x" }, { correlationId: "c5", resource: loadProject, handler: async () => ({}) }), "FORBIDDEN");
      expect(await runRoute(app, session, spec, { projectId: "P-OWN", title: "x" }, { correlationId: "c6", resource: loadProject, handler: async () => "done" })).toBe("done");
    });
  });
});
