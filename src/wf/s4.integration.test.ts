// Part 16 S4 database tests: comments leave the version sequence alone, the inbox lists the person's own and delegated steps only, the widget
// is rendered from the stored records, and the inbox reads 500 items within the Part 16 budget (1 s, §14). Database tests share one database.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { actOnWorkflow, delegateApprovals, startWorkflow } from "./engine";
import { addComment } from "./comments";
import { myInbox, workflowWidget } from "./read";
import type { Machine } from "./machine";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

const machine: Machine = {
  initial: "draft",
  states: {
    draft: { kind: "step", step: "originator" },
    review: { kind: "step", step: "review", slaWorkingDays: 2 },
    approved: { kind: "terminal", outcome: "approved" },
    rejected: { kind: "terminal", outcome: "rejected" },
  },
  transitions: [
    { from: "draft", action: "submit", to: "review" },
    { from: "review", action: "approve", to: "approved" },
    { from: "review", action: "reject", to: "rejected" },
    { from: "review", action: "return", to: "draft" },
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

describe.skipIf(!TEST_URL || !APP_URL)("comments, inbox and widget (Part 16 S4)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-wfs4test" });
    app = createPool(APP_URL!, { application_name: "erp-wfs4test-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  async function activeDefinition(tenant: string): Promise<void> {
    await withTransaction(owner, (c) => c.query("INSERT INTO wf_definitions (tenant_id, doc_type, version, status, machine, effective_from, created_by, activated_by, activated_at) VALUES ($1, 'po', 1, 'active', $2, '2026-01-01', 'ACME00001', 'ACME00002', now())", [tenant, JSON.stringify(machine)]), { tenantId: tenant });
  }

  it("keeps a comment out of the version sequence, so another person's approval is not made stale", async () => {
    const tenant = randomUUID();
    await activeDefinition(tenant);
    const requester = contextFor(tenant, "ACME00003");
    const s = await startWorkflow(app, requester, { docType: "po", docId: "PO-C1", submittedBy: "ACME00003", amount: 20000, assignees: { originator: "ACME00003" } });
    await actOnWorkflow(app, requester, { instanceId: s.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: key(), assignees: { review: "ACME00010" } });
    await addComment(app, contextFor(tenant, "ACME00011"), { instanceId: s.instanceId, body: "Please check the rate against the benchmark" });
    const approved = await actOnWorkflow(app, contextFor(tenant, "ACME00010"), { instanceId: s.instanceId, action: "approve", actor: "ACME00010", expectedVersion: 2, idempotencyKey: key() });
    expect(approved.state).toBe("approved");
    const widget = await workflowWidget(app, contextFor(tenant, "ACME00011"), "po", "PO-C1");
    expect(widget?.comments.map((c) => c.body)).toEqual(["Please check the rate against the benchmark"]);
    expect(widget?.history.map((h) => h.action)).toEqual(["submit", "approve"]);
  });

  it("refuses an empty comment", async () => {
    const tenant = randomUUID();
    await activeDefinition(tenant);
    const s = await startWorkflow(app, contextFor(tenant, "ACME00003"), { docType: "po", docId: "PO-C2", submittedBy: "ACME00003", amount: 1000, assignees: { originator: "ACME00003" } });
    await expect(addComment(app, contextFor(tenant, "ACME00003"), { instanceId: s.instanceId, body: "   " })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("lists the person's own steps and steps delegated to them, and nobody else's", async () => {
    const tenant = randomUUID();
    await activeDefinition(tenant);
    const requester = contextFor(tenant, "ACME00003");
    const mine = await startWorkflow(app, requester, { docType: "po", docId: "PO-IN-1", submittedBy: "ACME00003", amount: 20000, assignees: { originator: "ACME00003" } });
    await actOnWorkflow(app, requester, { instanceId: mine.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: key(), assignees: { review: "ACME00010" } });
    const theirs = await startWorkflow(app, requester, { docType: "po", docId: "PO-IN-2", submittedBy: "ACME00003", amount: 20000, assignees: { originator: "ACME00003" } });
    await actOnWorkflow(app, requester, { instanceId: theirs.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: key(), assignees: { review: "ACME00020" } });
    await delegateApprovals(app, contextFor(tenant, "ACME00010"), { delegate: "ACME00011", docType: null, validFrom: "2026-01-01T00:00:00Z", validTo: "2099-01-01T00:00:00Z", reason: "Away on site inspection" });

    const approverItems = await myInbox(app, contextFor(tenant, "ACME00010"));
    expect(approverItems.map((i) => i.docId)).toEqual(["PO-IN-1"]);
    const delegateItems = await myInbox(app, contextFor(tenant, "ACME00011"));
    expect(delegateItems.map((i) => [i.docId, i.delegatedFrom])).toEqual([["PO-IN-1", "ACME00010"]]);
    expect(approverItems[0].slaState).toBe("running");
    expect(approverItems[0].sodWarning).toBe(false);
  });

  it("reads 500 items inside the 1 s budget", async () => {
    const tenant = randomUUID();
    await activeDefinition(tenant);
    await withTransaction(owner, async (c) => {
      await c.query(
        `WITH ins AS (
           INSERT INTO wf_instances (tenant_id, doc_type, doc_id, definition_version, state, amount_snapshot, submitted_by)
           SELECT $1, 'po', 'PO-BULK-' || g, 1, 'review', 25000.00, 'ACME00003' FROM generate_series(1, 500) g
           RETURNING id, doc_id)
         INSERT INTO wf_tasks (tenant_id, instance_id, step, assignee, status, due_at, created_at)
         SELECT $1, ins.id, 'review', 'ACME00010', 'open', now() + interval '2 days', now() FROM ins`,
        [tenant],
      );
    }, { tenantId: tenant });
    const started = Date.now();
    const items = await myInbox(app, contextFor(tenant, "ACME00010"), { limit: 500 });
    const elapsed = Date.now() - started;
    expect(items).toHaveLength(500);
    expect(elapsed).toBeLessThan(1000);
  }, 60_000);
});
