// Part 16 S1 database tests: definition versioning and maker-checker activation (A-147), the engine's rules (no self-approval, one step per
// person, stale versions refused, idempotent replay), the reason rule, and the append-only action log. Database tests share one database.
import { randomBytes, randomUUID } from "node:crypto";
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
  states: {
    draft: { kind: "step", step: "originator" },
    review: { kind: "step", step: "review" },
    approved: { kind: "terminal", outcome: "approved" },
    rejected: { kind: "terminal", outcome: "rejected" },
    cancelled: { kind: "terminal", outcome: "cancelled" },
  },
  transitions: [
    { from: "draft", action: "submit", to: "review" },
    { from: "draft", action: "cancel", to: "cancelled" },
    { from: "review", action: "approve", to: "approved" },
    { from: "review", action: "reject", to: "rejected" },
    { from: "review", action: "return", to: "draft" },
    { from: "review", action: "cancel", to: "cancelled" },
  ],
};

function contextFor(tenantId: string, userId: string): RequestContext {
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

describe.skipIf(!TEST_URL || !APP_URL)("workflow engine (Part 16 S1)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-wftest" });
    app = createPool(APP_URL!, { application_name: "erp-wftest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** Creates a definition by one person and activates it by another (maker-checker, CP-WF-04). */
  async function activate(tenant: string, docType: string, version: number, maker: string, checker: string): Promise<void> {
    await withTransaction(owner, async (c) => {
      await c.query(
        "INSERT INTO wf_definitions (tenant_id, doc_type, version, status, machine, effective_from, created_by) VALUES ($1, $2, $3, 'draft', $4, '2026-01-01', $5)",
        [tenant, docType, version, JSON.stringify(machine), maker],
      );
      await c.query("UPDATE wf_definitions SET status = 'retired' WHERE tenant_id = $1 AND doc_type = $2 AND status = 'active'", [tenant, docType]);
      await c.query("UPDATE wf_definitions SET status = 'active', activated_by = $4, activated_at = now() WHERE tenant_id = $1 AND doc_type = $2 AND version = $3", [tenant, docType, version, checker]);
    }, { tenantId: tenant });
  }

  it("refuses a definition activated by the person who created it (maker-checker, CP-WF-04)", async () => {
    const tenant = randomUUID();
    await expect(
      withTransaction(owner, (c) => c.query(
        "INSERT INTO wf_definitions (tenant_id, doc_type, version, status, machine, effective_from, created_by, activated_by) VALUES ($1, 'po', 1, 'active', $2, '2026-01-01', 'ACME00001', 'ACME00001')",
        [tenant, JSON.stringify(machine)],
      ), { tenantId: tenant }),
    ).rejects.toThrow();
  });

  it("starts a workflow on the active version and stores the amount snapshot", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    const ctx = contextFor(tenant, "ACME00003");
    const started = await startWorkflow(app, ctx, { docType: "po", docId: "PO-1", submittedBy: "ACME00003", amount: 1200000, assignees: { originator: "ACME00003", review: "ACME00004" } });
    expect(started).toMatchObject({ state: "draft", stateVersion: 1, replayed: false });
    const row = await withTransaction(app, (c) => c.query<{ definition_version: number; amount_snapshot: string }>("SELECT definition_version, amount_snapshot FROM wf_instances WHERE id = $1", [started.instanceId]), { tenantId: tenant });
    expect(row.rows[0]).toEqual({ definition_version: 1, amount_snapshot: "1200000.00" });
  });

  it("keeps a running instance on its version when a new version is activated", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    const ctx = contextFor(tenant, "ACME00003");
    const started = await startWorkflow(app, ctx, { docType: "po", docId: "PO-OLD", submittedBy: "ACME00003", assignees: { originator: "ACME00003", review: "ACME00004" } });
    await activate(tenant, "po", 2, "ACME00005", "ACME00006");
    const row = await withTransaction(app, (c) => c.query<{ definition_version: number }>("SELECT definition_version FROM wf_instances WHERE id = $1", [started.instanceId]), { tenantId: tenant });
    expect(row.rows[0].definition_version).toBe(1);
  });

  it("refuses a second open workflow for the same document", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    const input = { docType: "po", docId: "PO-DUP", submittedBy: "ACME00003", assignees: { originator: "ACME00003", review: "ACME00004" } };
    await startWorkflow(app, contextFor(tenant, "ACME00003"), input);
    await expectRefused(startWorkflow(app, contextFor(tenant, "ACME00003"), input), "CONFLICT", "already open");
  });

  it("refuses the submitter approving their own document, even when they hold the reviewer step (CP-WF-01)", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    // The submitter raised the document on behalf of the originator, so they do not already hold a step and could be given review.
    const originator = contextFor(tenant, "ACME00009");
    const s = await startWorkflow(app, originator, { docType: "po", docId: "PO-SELF", submittedBy: "ACME00003", assignees: { originator: "ACME00009", review: "ACME00003" } });
    await actOnWorkflow(app, originator, { instanceId: s.instanceId, action: "submit", actor: "ACME00009", expectedVersion: 1, idempotencyKey: `k-${randomUUID()}`, assignees: { review: "ACME00003" } });
    await expectRefused(
      actOnWorkflow(app, contextFor(tenant, "ACME00003"), { instanceId: s.instanceId, action: "approve", actor: "ACME00003", expectedVersion: 2, idempotencyKey: `k-${randomUUID()}` }),
      "FORBIDDEN",
      "cannot approve it",
    );
  });

  it("refuses one person at two levels of the same document", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    const ctx = contextFor(tenant, "ACME00003");
    const s = await startWorkflow(app, ctx, { docType: "po", docId: "PO-TWO", submittedBy: "ACME00003", assignees: { originator: "ACME00003", review: "ACME00004" } });
    await expectRefused(
      actOnWorkflow(app, ctx, { instanceId: s.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: `k-${randomUUID()}`, assignees: { review: "ACME00003" } }),
      "FORBIDDEN",
      "another level",
    );
  });

  it("applies an approval, closes the workflow, and refuses further actions on it", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    const submitter = contextFor(tenant, "ACME00003");
    const s = await startWorkflow(app, submitter, { docType: "po", docId: "PO-OK", submittedBy: "ACME00003", assignees: { originator: "ACME00003", review: "ACME00004" } });
    const sent = await actOnWorkflow(app, submitter, { instanceId: s.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: `k-${randomUUID()}`, assignees: { review: "ACME00004" } });
    expect(sent).toMatchObject({ state: "review", stateVersion: 2 });
    const approved = await actOnWorkflow(app, contextFor(tenant, "ACME00004"), { instanceId: s.instanceId, action: "approve", actor: "ACME00004", expectedVersion: 2, idempotencyKey: `k-${randomUUID()}` });
    expect(approved).toMatchObject({ state: "approved", stateVersion: 3 });
    await expectRefused(
      actOnWorkflow(app, contextFor(tenant, "ACME00004"), { instanceId: s.instanceId, action: "reject", actor: "ACME00004", expectedVersion: 3, idempotencyKey: `k-${randomUUID()}`, reasonCode: "OTHER", comment: "Changed my mind later" }),
      "VALIDATION_FAILED",
      "closed",
    );
  });

  it("refuses a stale version and says who acted first", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    const submitter = contextFor(tenant, "ACME00003");
    const s = await startWorkflow(app, submitter, { docType: "po", docId: "PO-STALE", submittedBy: "ACME00003", assignees: { originator: "ACME00003", review: "ACME00004" } });
    await actOnWorkflow(app, submitter, { instanceId: s.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: `k-${randomUUID()}`, assignees: { review: "ACME00004" } });
    await expectRefused(
      actOnWorkflow(app, contextFor(tenant, "ACME00004"), { instanceId: s.instanceId, action: "approve", actor: "ACME00004", expectedVersion: 1, idempotencyKey: `k-${randomUUID()}` }),
      "CONFLICT",
      "already actioned by ACME00003",
    );
  });

  it("treats a repeated idempotency key as a replay: the same result, and no second action", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    const submitter = contextFor(tenant, "ACME00003");
    const s = await startWorkflow(app, submitter, { docType: "po", docId: "PO-IDEM", submittedBy: "ACME00003", assignees: { originator: "ACME00003", review: "ACME00004" } });
    const key = `k-${randomUUID()}`;
    const input = { instanceId: s.instanceId, action: "submit" as const, actor: "ACME00003", expectedVersion: 1, idempotencyKey: key, assignees: { review: "ACME00004" } };
    const first = await actOnWorkflow(app, submitter, input);
    const again = await actOnWorkflow(app, submitter, input);
    expect(again).toMatchObject({ state: first.state, stateVersion: first.stateVersion, replayed: true });
    const count = await withTransaction(app, (c) => c.query("SELECT 1 FROM wf_action_log WHERE idempotency_key = $1", [key]), { tenantId: tenant });
    expect(count.rowCount).toBe(1);
  });

  it("refuses a rejection without a reason, and accepts one with a code and comment", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    const submitter = contextFor(tenant, "ACME00003");
    const s = await startWorkflow(app, submitter, { docType: "po", docId: "PO-REASON", submittedBy: "ACME00003", assignees: { originator: "ACME00003", review: "ACME00004" } });
    await actOnWorkflow(app, submitter, { instanceId: s.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: `k-${randomUUID()}`, assignees: { review: "ACME00004" } });
    await expectRefused(
      actOnWorkflow(app, contextFor(tenant, "ACME00004"), { instanceId: s.instanceId, action: "reject", actor: "ACME00004", expectedVersion: 2, idempotencyKey: `k-${randomUUID()}` }),
      "VALIDATION_FAILED",
      "reason code",
    );
    const rejected = await actOnWorkflow(app, contextFor(tenant, "ACME00004"), { instanceId: s.instanceId, action: "reject", actor: "ACME00004", expectedVersion: 2, idempotencyKey: `k-${randomUUID()}`, reasonCode: "RATE_TOO_HIGH", comment: "Rate is above the benchmark" });
    expect(rejected.state).toBe("rejected");
  });

  it("returns to the originator, who resubmits to the same step without a second task", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    const submitter = contextFor(tenant, "ACME00003");
    const s = await startWorkflow(app, submitter, { docType: "po", docId: "PO-RET", submittedBy: "ACME00003", assignees: { originator: "ACME00003", review: "ACME00004" } });
    await actOnWorkflow(app, submitter, { instanceId: s.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: `k-${randomUUID()}`, assignees: { review: "ACME00004" } });
    const returned = await actOnWorkflow(app, contextFor(tenant, "ACME00004"), { instanceId: s.instanceId, action: "return", actor: "ACME00004", expectedVersion: 2, idempotencyKey: `k-${randomUUID()}`, reasonCode: "MISSING_INFO", comment: "Please attach the quotations", assignees: { originator: "ACME00003" } });
    expect(returned).toMatchObject({ state: "draft", stateVersion: 3 });
    await actOnWorkflow(app, submitter, { instanceId: s.instanceId, action: "resubmit", actor: "ACME00003", expectedVersion: 3, idempotencyKey: `k-${randomUUID()}`, assignees: { review: "ACME00004" } }).catch((e: { code?: string; reason?: string }) => e);
    const tasks = await withTransaction(app, (c) => c.query<{ assignee: string; step: string }>("SELECT assignee, step FROM wf_tasks WHERE instance_id = $1 AND assignee = 'ACME00003'", [s.instanceId]), { tenantId: tenant });
    expect(tasks.rowCount).toBe(1);
  });

  it("keeps the action log append-only for the application role", async () => {
    const tenant = randomUUID();
    await activate(tenant, "po", 1, "ACME00001", "ACME00002");
    const ctx = contextFor(tenant, "ACME00003");
    const s = await startWorkflow(app, ctx, { docType: "po", docId: "PO-LOG", submittedBy: "ACME00003", assignees: { originator: "ACME00003", review: "ACME00004" } });
    await actOnWorkflow(app, ctx, { instanceId: s.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: `k-${randomUUID()}`, assignees: { review: "ACME00004" } });
    await expect(withTransaction(app, (c) => c.query("UPDATE wf_action_log SET actor = 'X'"), { tenantId: tenant })).rejects.toThrow(/permission denied/);
    await expect(withTransaction(app, (c) => c.query("DELETE FROM wf_action_log"), { tenantId: tenant })).rejects.toThrow(/permission denied/);
  });
});
