// Part 17 S1 database tests: the registry's maker-checker activation (CP-PROTOCOL-03), an OBSERVE evaluation that logs what it would have
// blocked and blocks nothing, duplicate fingerprints across commits, the read-only gate status (REQ-PROTOCOL-F04), and the append-only log.
// Database tests share one database.
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
import { activateControlPoint, proposeControlPoint } from "./registry";
import { evaluateControls, gateStatus } from "./engine";

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

describe.skipIf(!TEST_URL || !APP_URL)("protocol engine S1 (Part 17)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-protocols1test" });
    app = createPool(APP_URL!, { application_name: "erp-protocols1test-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  it("refuses a control point activated by its author, and retires the one it replaces", async () => {
    const tenant = randomUUID();
    const author = contextFor(tenant, "ACME00001");
    const checker = contextFor(tenant, "ACME00002");
    const v1 = await proposeControlPoint(app, author, { cpCode: "MAT_QTY_LIMIT", title: "Material quantity limit", stage: "APPROVE", checkKind: "THRESHOLD", params: { field: "qty", max: 1 }, enforcement: "BLOCK", ownerRole: "protocol_officer" });
    await expect(activateControlPoint(app, author, { cpCode: "MAT_QTY_LIMIT", version: v1.version })).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    await activateControlPoint(app, checker, { cpCode: "MAT_QTY_LIMIT", version: v1.version });
    const v2 = await proposeControlPoint(app, author, { cpCode: "MAT_QTY_LIMIT", title: "Material quantity limit", stage: "APPROVE", checkKind: "THRESHOLD", params: { field: "qty", max: 2 }, enforcement: "BLOCK", ownerRole: "protocol_officer" });
    await activateControlPoint(app, checker, { cpCode: "MAT_QTY_LIMIT", version: v2.version });
    const rows = await withTransaction(app, (c) => c.query<{ version: number; status: string }>("SELECT version, status FROM protocol_control_points WHERE cp_code = 'MAT_QTY_LIMIT' ORDER BY version"), { tenantId: tenant });
    expect(rows.rows).toEqual([{ version: 1, status: "retired" }, { version: 2, status: "active" }]);
  });

  it("logs what an OBSERVE control point would have blocked, and blocks nothing", async () => {
    const tenant = randomUUID();
    const author = contextFor(tenant, "ACME00001");
    const checker = contextFor(tenant, "ACME00002");
    const v = await proposeControlPoint(app, author, { cpCode: "DPR_QTY_LIMIT", title: "DPR quantity limit", stage: "RECORD", checkKind: "THRESHOLD", params: { field: "qty", max: 1 }, enforcement: "BLOCK", ownerRole: "protocol_officer" });
    await activateControlPoint(app, checker, { cpCode: "DPR_QTY_LIMIT", version: v.version });
    const out = await runUnitOfWork(app, author, (uow) => evaluateControls(uow.client, author, { stage: "RECORD", payload: { qty: 1.4 } }));
    expect(out.result).toBe("PASS");
    expect(out.wouldBe).toBe("BLOCK");
    expect(out.items[0]).toMatchObject({ cpCode: "DPR_QTY_LIMIT", mode: "OBSERVE", outcome: "FAIL" });
    const logged = await withTransaction(app, (c) => c.query<{ result: string; mode: string; inputs: { qty: number }; reasons: string[] }>("SELECT result, mode, inputs, reasons FROM protocol_evaluations WHERE cp_code = 'DPR_QTY_LIMIT'"), { tenantId: tenant });
    expect(logged.rows[0]).toMatchObject({ result: "WOULD_BLOCK", mode: "OBSERVE", inputs: { qty: 1.4 } });
    expect(logged.rows[0].reasons[0]).toContain("above the limit");
  });

  it("records an unavailable source as UNAVAILABLE, not as a pass", async () => {
    const tenant = randomUUID();
    const author = contextFor(tenant, "ACME00001");
    const v = await proposeControlPoint(app, author, { cpCode: "BUDGET_CHECK", title: "Budget available", stage: "APPROVE", checkKind: "BUDGET_AVAILABLE", params: {}, enforcement: "BLOCK", ownerRole: "cost_controller" });
    await activateControlPoint(app, contextFor(tenant, "ACME00002"), { cpCode: "BUDGET_CHECK", version: v.version });
    const out = await runUnitOfWork(app, author, (uow) => evaluateControls(uow.client, author, { payload: {} }));
    expect(out.items[0]).toMatchObject({ outcome: "UNAVAILABLE", logged: "UNAVAILABLE" });
    expect(out.items[0].reasons[0]).toContain("Part 39");
  });

  it("refuses a duplicate committed twice inside the window, and does not record a fingerprint without a commit", async () => {
    const tenant = randomUUID();
    const author = contextFor(tenant, "ACME00001");
    const v = await proposeControlPoint(app, author, { cpCode: "PO_DUPLICATE", title: "Duplicate purchase order", stage: "APPROVE", checkKind: "DUPLICATE", params: { fields: ["vendor", "item", "qty"], windowHours: 24 }, enforcement: "BLOCK", ownerRole: "procurement_head" });
    await activateControlPoint(app, contextFor(tenant, "ACME00002"), { cpCode: "PO_DUPLICATE", version: v.version });
    const payload = { vendor: "V1", item: "CEMENT", qty: 40 };
    await runUnitOfWork(app, author, (uow) => evaluateControls(uow.client, author, { payload, commit: false, cpCodes: ["PO_DUPLICATE"], entityId: "PO-1" }));
    await runUnitOfWork(app, author, (uow) => evaluateControls(uow.client, author, { payload, commit: true, cpCodes: ["PO_DUPLICATE"], entityId: "PO-1" }));
    const second = await runUnitOfWork(app, author, (uow) => evaluateControls(uow.client, author, { payload, commit: true, cpCodes: ["PO_DUPLICATE"], entityId: "PO-2" }));
    expect(second.wouldBe).toBe("BLOCK");
    expect(second.items[0].reasons[0]).toContain("within 24 hours");
  });

  it("shows what would block before the user acts, and writes nothing", async () => {
    const tenant = randomUUID();
    const author = contextFor(tenant, "ACME00001");
    const v = await proposeControlPoint(app, author, { cpCode: "GATE_QTY", title: "Gate quantity", stage: "EXECUTE", checkKind: "THRESHOLD", params: { field: "qty", max: 1 }, enforcement: "EXCEPTION", ownerRole: "protocol_officer" });
    await activateControlPoint(app, contextFor(tenant, "ACME00002"), { cpCode: "GATE_QTY", version: v.version });
    const preview = await gateStatus(app, author, { payload: { qty: 3 } });
    expect(preview.wouldBe).toBe("EXCEPTION_REQUIRED");
    const logged = await withTransaction(app, (c) => c.query("SELECT 1 FROM protocol_evaluations WHERE cp_code = 'GATE_QTY'"), { tenantId: tenant });
    expect(logged.rowCount).toBe(0);
  });

  it("keeps the evaluation log append-only for the application role", async () => {
    const tenant = randomUUID();
    const author = contextFor(tenant, "ACME00001");
    const v = await proposeControlPoint(app, author, { cpCode: "LOG_CHECK", title: "Log check", stage: "RECORD", checkKind: "THRESHOLD", params: { field: "qty", max: 1 }, enforcement: "WARN", ownerRole: "protocol_officer" });
    await activateControlPoint(app, contextFor(tenant, "ACME00002"), { cpCode: "LOG_CHECK", version: v.version });
    await runUnitOfWork(app, author, (uow) => evaluateControls(uow.client, author, { payload: { qty: 2 } }));
    await expect(withTransaction(app, (c) => c.query("UPDATE protocol_evaluations SET result = 'PASS'"), { tenantId: tenant })).rejects.toThrow(/permission denied/);
    await expect(withTransaction(app, (c) => c.query("DELETE FROM protocol_evaluations"), { tenantId: tenant })).rejects.toThrow(/permission denied/);
  });
});
