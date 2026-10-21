// Part 16 S5 database tests: a decision stores its panel in the same transaction (CP-WF-05), the stored panel cannot be changed by the
// application role, and a decision whose snapshot cannot be stored does not happen. Database tests share one database.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { actOnWorkflow, startWorkflow } from "./engine";
import type { Machine } from "./machine";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

const machine: Machine = {
  initial: "draft",
  states: { draft: { kind: "step", step: "originator" }, review: { kind: "step", step: "review" }, approved: { kind: "terminal", outcome: "approved" }, rejected: { kind: "terminal", outcome: "rejected" } },
  transitions: [
    { from: "draft", action: "submit", to: "review" },
    { from: "review", action: "approve", to: "approved" },
    { from: "review", action: "reject", to: "rejected" },
  ],
};

function contextFor(tenantId: string, userId: string): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

const key = () => `k-${randomUUID()}`;

describe.skipIf(!TEST_URL || !APP_URL)("decision snapshots (Part 16 S5)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-wfs5test" });
    app = createPool(APP_URL!, { application_name: "erp-wfs5test-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  async function reviewedDocument(tenant: string, docId: string, splitKey?: string): Promise<number> {
    await withTransaction(owner, (c) => c.query("INSERT INTO wf_definitions (tenant_id, doc_type, version, status, machine, effective_from, created_by, activated_by, activated_at) VALUES ($1, 'po', 1, 'active', $2, '2026-01-01', 'ACME00001', 'ACME00002', now()) ON CONFLICT DO NOTHING", [tenant, JSON.stringify(machine)]), { tenantId: tenant });
    const requester = contextFor(tenant, "ACME00003");
    const s = await startWorkflow(app, requester, { docType: "po", docId, submittedBy: "ACME00003", amount: 450000, assignees: { originator: "ACME00003" }, splitKey });
    await actOnWorkflow(app, requester, { instanceId: s.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: key(), assignees: { review: "ACME00010" } });
    return s.instanceId;
  }

  it("stores the panel with the approval in the same transaction, including the cumulative figure and the unavailable sources", async () => {
    const tenant = randomUUID();
    const key1 = "VEND-1|STEEL|P3";
    await reviewedDocument(tenant, "PO-S5-0", key1);
    await reviewedDocument(tenant, "PO-S5-1", key1);
    const id = await reviewedDocument(tenant, "PO-S5-2", key1);
    await actOnWorkflow(app, contextFor(tenant, "ACME00010"), { instanceId: id, action: "approve", actor: "ACME00010", expectedVersion: 2, idempotencyKey: key() });
    const snap = await withTransaction(app, (c) => c.query<{ action: string; actor: string; context_json: { sections: { id: string; status: string; reason?: string; value?: { cumulativePaise?: number } }[] } }>("SELECT action, actor, context_json FROM dec_context_snapshots WHERE instance_id = $1", [id]), { tenantId: tenant });
    expect(snap.rowCount).toBe(1);
    expect(snap.rows[0]).toMatchObject({ action: "approve", actor: "ACME00010" });
    const sections = snap.rows[0].context_json.sections;
    expect(sections.find((s) => s.id === "treasury.cash")).toMatchObject({ status: "unavailable", reason: expect.stringContaining("Cash forecast unavailable") });
    expect(sections.find((s) => s.id === "workflow.amount")?.value?.cumulativePaise).toBe(135000000);
  });

  it("refuses the application role any change to a stored panel", async () => {
    const tenant = randomUUID();
    const id = await reviewedDocument(tenant, "PO-S5-3");
    await actOnWorkflow(app, contextFor(tenant, "ACME00010"), { instanceId: id, action: "reject", actor: "ACME00010", expectedVersion: 2, idempotencyKey: key(), reasonCode: "RATE_TOO_HIGH", comment: "Rate is above the benchmark" });
    await expect(withTransaction(app, (c) => c.query("UPDATE dec_context_snapshots SET actor = 'X'"), { tenantId: tenant })).rejects.toThrow(/permission denied/);
    await expect(withTransaction(app, (c) => c.query("DELETE FROM dec_context_snapshots"), { tenantId: tenant })).rejects.toThrow(/permission denied/);
  });

  it("does not make the decision when its panel cannot be stored", async () => {
    const tenant = randomUUID();
    const id = await reviewedDocument(tenant, "PO-S5-4");
    await withTransaction(owner, (c) => c.query("CREATE OR REPLACE FUNCTION tmp_refuse() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'snapshot store refused'; END; $$ LANGUAGE plpgsql"), { tenantId: tenant });
    await withTransaction(owner, (c) => c.query("CREATE TRIGGER tmp_refuse BEFORE INSERT ON dec_context_snapshots FOR EACH ROW EXECUTE FUNCTION tmp_refuse()"), { tenantId: tenant });
    try {
      await expect(actOnWorkflow(app, contextFor(tenant, "ACME00010"), { instanceId: id, action: "approve", actor: "ACME00010", expectedVersion: 2, idempotencyKey: key() })).rejects.toThrow(/snapshot store refused/);
    } finally {
      await withTransaction(owner, (c) => c.query("DROP TRIGGER IF EXISTS tmp_refuse ON dec_context_snapshots"), { tenantId: tenant });
      await withTransaction(owner, (c) => c.query("DROP FUNCTION IF EXISTS tmp_refuse()"), { tenantId: tenant });
    }
    const still = await withTransaction(app, (c) => c.query<{ state: string }>("SELECT state FROM wf_instances WHERE id = $1", [id]), { tenantId: tenant });
    expect(still.rows[0].state).toBe("review");
  });
});
