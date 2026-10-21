// Part 16 S2 database tests: decision-table maker-checker and simulation gating (CP-WF-04), cumulative reads of the instances (A-149), approver
// resolution against role assignments and authority limits, and the context snapshots that simulation reads. Database tests share one database.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { startWorkflow } from "./engine";
import { activateDecisionTable, activeTable, recordSimulation, saveDecisionTable } from "./store";
import { priorAmounts } from "./doa";
import { resolveStep } from "./resolve";
import { loadSnapshots } from "./simulate";
import type { Table } from "./decision";
import type { Machine } from "./machine";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

const table: Table = {
  inputs: [{ name: "amount", type: "number" }],
  hitPolicy: "unique",
  rows: [
    { conditions: { amount: { max: 500000 } }, outputs: { levels: ["site_in_charge"] } },
    { conditions: { amount: { min: 500000 } }, outputs: { levels: ["project_manager"] } },
  ],
};

const machine: Machine = {
  initial: "draft",
  states: { draft: { kind: "step", step: "originator" }, review: { kind: "step", step: "review" }, approved: { kind: "terminal", outcome: "approved" } },
  transitions: [
    { from: "draft", action: "submit", to: "review" },
    { from: "review", action: "approve", to: "approved" },
  ],
};

function contextFor(tenantId: string, userId: string): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

describe.skipIf(!TEST_URL || !APP_URL)("decision tables, cumulative reads and resolution (Part 16 S2)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-wfs2test" });
    app = createPool(APP_URL!, { application_name: "erp-wfs2test-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  it("refuses to activate a table nobody has simulated, and the author cannot activate it", async () => {
    const tenant = randomUUID();
    const author = contextFor(tenant, "ACME00001");
    const checker = contextFor(tenant, "ACME00002");
    const saved = await saveDecisionTable(app, author, { code: "po_route", table });
    expect(saved.version).toBe(1);
    expect(saved.coverage.gaps).toEqual([]);
    await expect(activateDecisionTable(app, checker, { code: "po_route", version: 1 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await recordSimulation(app, author, { code: "po_route", version: 1 });
    await expect(activateDecisionTable(app, author, { code: "po_route", version: 1 })).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    await activateDecisionTable(app, checker, { code: "po_route", version: 1 });
    expect(await activeTable(app, author, "po_route")).toEqual(table);
  });

  it("retires the previous active version when a new one is activated", async () => {
    const tenant = randomUUID();
    const author = contextFor(tenant, "ACME00001");
    const checker = contextFor(tenant, "ACME00002");
    await saveDecisionTable(app, author, { code: "po_route", table });
    await recordSimulation(app, author, { code: "po_route", version: 1 });
    await activateDecisionTable(app, checker, { code: "po_route", version: 1 });
    await saveDecisionTable(app, author, { code: "po_route", table: { ...table, rows: [{ conditions: { amount: "any" }, outputs: { levels: ["management"] } }] } });
    await recordSimulation(app, author, { code: "po_route", version: 2 });
    await activateDecisionTable(app, checker, { code: "po_route", version: 2 });
    const statuses = await withTransaction(app, (c) => c.query<{ version: number; status: string }>("SELECT version, status FROM rul_decision_tables WHERE code = 'po_route' ORDER BY version"), { tenantId: tenant });
    expect(statuses.rows).toEqual([{ version: 1, status: "retired" }, { version: 2, status: "active" }]);
  });

  it("reads earlier workflows with the same split key inside the window for cumulative evaluation", async () => {
    const tenant = randomUUID();
    await withTransaction(owner, async (c) => {
      await c.query("INSERT INTO wf_definitions (tenant_id, doc_type, version, status, machine, effective_from, created_by, activated_by, activated_at) VALUES ($1, 'po', 1, 'active', $2, '2026-01-01', 'ACME00001', 'ACME00002', now())", [tenant, JSON.stringify(machine)]);
    }, { tenantId: tenant });
    const ctx = contextFor(tenant, "ACME00003");
    const key = "VEND-7|STEEL|P3";
    for (const [docId, amount] of [["PO-A", 450000], ["PO-B", 450000], ["PO-C", 450000]] as const) {
      await startWorkflow(app, ctx, { docType: "po", docId, submittedBy: "ACME00003", amount, assignees: { originator: "ACME00003" }, splitKey: key, context: { project: "P3" } });
    }
    const prior = await priorAmounts(app, ctx, key, new Date().toISOString(), 7);
    expect(prior.map((p) => p.docId).sort()).toEqual(["PO-A", "PO-B", "PO-C"]);
    expect(prior.every((p) => p.amountPaise === 45000000)).toBe(true);
    expect(await priorAmounts(app, ctx, "OTHER|KEY|X", new Date().toISOString(), 7)).toEqual([]);
  });

  it("resolves a step to the holder of the role with the smallest sufficient authority, never the submitter", async () => {
    const tenant = randomUUID();
    const admin = "ACME00100";
    await withTransaction(owner, async (c) => {
      const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, 'project_manager', 'Project manager', $2) RETURNING id", [tenant, admin]);
      for (const user of ["ACME00201", "ACME00202", "ACME00203"]) {
        await c.query(
          "INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', $4, 'ACME00101', 'approved', 'Project manager for the Pune project')",
          [tenant, user, role.rows[0].id, admin],
        );
      }
      const limits: [string, number][] = [["ACME00201", 2000000], ["ACME00202", 5000000], ["ACME00203", 9000000]];
      for (const [user, paise] of limits) {
        await c.query(
          "INSERT INTO iam_authority_limits (tenant_id, user_ref, doc_type, max_amount_paise, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, 'po', $3, '2026-01-01', $4, 'ACME00101', 'approved', 'Authority for purchase orders')",
          [tenant, user, paise * 100, admin],
        );
      }
    }, { tenantId: tenant });
    const ctx = contextFor(tenant, "ACME00201");
    const resolved = await resolveStep(app, ctx, { roleCode: "project_manager", docType: "po", amountPaise: 1200000 * 100, submitter: "ACME00201", entityId: "PO-R1", at: new Date().toISOString().slice(0, 10) });
    expect(resolved).toEqual({ kind: "resolved", approver: "ACME00202" });
    const none = await resolveStep(app, ctx, { roleCode: "project_manager", docType: "po", amountPaise: 99000000 * 100, submitter: "ACME00201", entityId: "PO-R2", at: new Date().toISOString().slice(0, 10) });
    expect(none).toMatchObject({ kind: "unresolved" });
  });

  it("stores the context with each instance, and simulation reads it back", async () => {
    const tenant = randomUUID();
    await withTransaction(owner, async (c) => {
      await c.query("INSERT INTO wf_definitions (tenant_id, doc_type, version, status, machine, effective_from, created_by, activated_by, activated_at) VALUES ($1, 'po', 1, 'active', $2, '2026-01-01', 'ACME00001', 'ACME00002', now())", [tenant, JSON.stringify(machine)]);
    }, { tenantId: tenant });
    const ctx = contextFor(tenant, "ACME00003");
    await startWorkflow(app, ctx, { docType: "po", docId: "PO-SNAP", submittedBy: "ACME00003", amount: 1200000, assignees: { originator: "ACME00003" }, context: { project: "P3", category: "steel" } });
    const docs = await loadSnapshots(app, ctx, "po", "2000-01-01T00:00:00Z");
    expect(docs).toEqual([{ docId: "PO-SNAP", inputs: { project: "P3", category: "steel" }, amount: 1200000 }]);
  });
});
