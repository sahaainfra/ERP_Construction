// Part 17 S2 database tests: an exception approved by the band's role, used once inside a transaction and refused after (REQ-PROTOCOL-F05),
// emergency execution regularised by someone other than the requester and overdue when not (CP-PROTOCOL-04), configuration activated by
// someone other than its author (CP-PROTOCOL-03), and the append-only consumption log. Database tests share one database.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { activateConfig, approveException, consumeException, proposeConfig, regulariseEmergency, requestException, startEmergency, overdueEmergencies, thresholdFor } from "./exception-store";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

function contextFor(tenantId: string, userId: string): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

describe.skipIf(!TEST_URL || !APP_URL)("exceptions, emergencies and configuration (Part 17 S2)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-protocols2test" });
    app = createPool(APP_URL!, { application_name: "erp-protocols2test-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** Gives people the roles the bands and emergencies need, through an approved assignment set up by an administrator. */
  async function roles(tenant: string, assignments: [string, string][]): Promise<void> {
    await withTransaction(owner, async (c) => {
      for (const code of ["project_manager", "management", "cost_controller"]) {
        await c.query("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, $2, 'ACME00100') ON CONFLICT DO NOTHING", [tenant, code]).catch(() => undefined);
      }
      for (const [user, code] of assignments) {
        await c.query(
          `INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason)
           SELECT $1, $2, r.id, 'tenant', '2026-01-01', 'ACME00100', 'ACME00101', 'approved', 'Approver for protocol exceptions' FROM iam_roles r WHERE r.tenant_id = $1 AND r.role_code = $3`,
          [tenant, user, code],
        );
      }
    }, { tenantId: tenant });
  }

  const narrative = "Concrete pour delayed by a broken pump; extra cement needed";

  it("uses a 0.8 MT over-plan exception once, and refuses the second use", async () => {
    const tenant = randomUUID();
    await roles(tenant, [["ACME00200", "project_manager"]]);
    const requester = contextFor(tenant, "ACME00201");
    const exc = await requestException(app, requester, { exceptionType: "QTY_OVER_PLAN", reference: "PLAN-7", requestedValue: 0.8, unit: "MT", variancePct: 3, amountPaise: 900000, reasonCode: "SITE_SHORTAGE", narrative, validity: "SINGLE_USE" });
    expect(exc.band).toBe("PM");
    await expect(approveException(app, requester, { id: exc.id, cap: 0.8 })).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    await approveException(app, contextFor(tenant, "ACME00200"), { id: exc.id, cap: 0.8 });
    await runUnitOfWork(app, requester, (uow) => consumeException(uow.client, requester, { id: exc.id, quantity: 0.8, transactionRef: "ISSUE-44" }));
    await expect(runUnitOfWork(app, requester, (uow) => consumeException(uow.client, requester, { id: exc.id, quantity: 0.8, transactionRef: "ISSUE-45" }))).rejects.toMatchObject({ code: "VALIDATION_FAILED", reason: expect.stringContaining("already used") });
    const status = await withTransaction(app, (c) => c.query<{ status: string; consumed_total: string }>("SELECT status, consumed_total FROM protocol_exceptions WHERE id = $1", [exc.id]), { tenantId: tenant });
    expect(status.rows[0]).toEqual({ status: "CONSUMED", consumed_total: "0.8000" });
  });

  it("refuses an approver without the band's role", async () => {
    const tenant = randomUUID();
    await roles(tenant, []);
    const exc = await requestException(app, contextFor(tenant, "ACME00201"), { exceptionType: "BUDGET_OVERRUN", reference: "BUD-1", requestedValue: 1, unit: "INR", variancePct: 12, amountPaise: 9000000, reasonCode: "PRICE_RISE", narrative, validity: "UNTIL_DATE", validUntil: "2026-12-31" });
    expect(exc.band).toBe("MANAGEMENT");
    await expect(approveException(app, contextFor(tenant, "ACME00202"), { id: exc.id, cap: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("starts an emergency with a photo and GPS, regularises it by a manager, and lists it when no one regularises it in time", async () => {
    const tenant = randomUUID();
    await roles(tenant, [["ACME00200", "project_manager"]]);
    const site = contextFor(tenant, "ACME00201");
    await expect(startEmergency(app, site, { reference: "DIESEL-1", reasonCode: "BREAKDOWN", narrative, evidence: { gps: { lat: 18.5, lng: 73.8 } } })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const done = await startEmergency(app, site, { reference: "DIESEL-1", reasonCode: "BREAKDOWN", narrative, evidence: { photoRef: "img-1", gps: { lat: 18.5, lng: 73.8 } } });
    await expect(regulariseEmergency(app, site, { id: done.id, decision: "approve", note: "Regularising my own emergency purchase" })).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    await regulariseEmergency(app, contextFor(tenant, "ACME00200"), { id: done.id, decision: "approve", note: "Checked the photo and the GPS; diesel was needed" });
    const other = await startEmergency(app, site, { reference: "DIESEL-2", reasonCode: "BREAKDOWN", narrative, evidence: { photoRef: "img-2", gps: { lat: 18.5, lng: 73.8 } } });
    const later = new Date(Date.now() + 25 * 3_600_000);
    const overdue = await overdueEmergencies(app, site, later);
    expect(overdue.map((o) => o.id)).toEqual([other.id]);
  });

  it("activates a threshold only after someone other than its author has checked it, and uses it for its scope and date", async () => {
    const tenant = randomUUID();
    const author = contextFor(tenant, "ACME00001");
    const checker = contextFor(tenant, "ACME00002");
    await proposeConfig(app, author, { kind: "THRESHOLD", itemKey: "budget.warn_pct", body: { scopeType: "PROJECT", scopeId: "P3", value: 85, effectiveFrom: "2026-06-01" } });
    const before = await withTransaction(app, (c) => thresholdFor(c, author, "budget.warn_pct", "2026-07-01", { companyId: "ACME", projectId: "P3" }), { tenantId: tenant });
    expect(before).toBeNull();
    await expect(activateConfig(app, author, { kind: "THRESHOLD", itemKey: "budget.warn_pct", version: 1 })).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    await activateConfig(app, checker, { kind: "THRESHOLD", itemKey: "budget.warn_pct", version: 1 });
    const after = await withTransaction(app, (c) => thresholdFor(c, author, "budget.warn_pct", "2026-07-01", { companyId: "ACME", projectId: "P3" }), { tenantId: tenant });
    expect(after).toBe(85);
  });

  it("keeps the consumption log append-only for the application role", async () => {
    const tenant = randomUUID();
    await roles(tenant, [["ACME00200", "project_manager"]]);
    const requester = contextFor(tenant, "ACME00201");
    const exc = await requestException(app, requester, { exceptionType: "QTY_OVER_PLAN", reference: "PLAN-9", requestedValue: 1, unit: "MT", variancePct: 1, amountPaise: 100000, reasonCode: "SITE_SHORTAGE", narrative, validity: "QUANTITY_CAP" });
    await approveException(app, contextFor(tenant, "ACME00200"), { id: exc.id, cap: 2 });
    await runUnitOfWork(app, requester, (uow) => consumeException(uow.client, requester, { id: exc.id, quantity: 0.5, transactionRef: "ISSUE-9" }));
    await expect(withTransaction(app, (c) => c.query("UPDATE protocol_exception_consumptions SET quantity = 9"), { tenantId: tenant })).rejects.toThrow(/permission denied/);
    await expect(withTransaction(app, (c) => c.query("DELETE FROM protocol_exception_consumptions"), { tenantId: tenant })).rejects.toThrow(/permission denied/);
  });
});
