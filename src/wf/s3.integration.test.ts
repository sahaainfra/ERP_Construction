// Part 16 S3 database tests: delegation with the delegator's limit and one hop (A-156), recall and reassignment with their guards, SLA
// expiry that returns and never approves (A-158), amendments of approved records only (A-148), and emergency approvals with regularisation
// by someone other than the submitter (A-157). Database tests share one database.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { actOnWorkflow, delegateApprovals, reassignStep, regulariseEmergency, startWorkflow } from "./engine";
import { overdueEmergencies, sweepSla } from "./sla";
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
    cancelled: { kind: "terminal", outcome: "cancelled" },
  },
  transitions: [
    { from: "draft", action: "submit", to: "review" },
    { from: "draft", action: "resubmit", to: "review" },
    { from: "draft", action: "cancel", to: "cancelled" },
    { from: "review", action: "approve", to: "approved" },
    { from: "review", action: "reject", to: "rejected" },
    { from: "review", action: "return", to: "draft" },
    { from: "review", action: "recall", to: "draft" },
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

const key = () => `k-${randomUUID()}`;

describe.skipIf(!TEST_URL || !APP_URL)("delegation, recall, reassignment, SLA, amendments and emergencies (Part 16 S3)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-wfs3test" });
    app = createPool(APP_URL!, { application_name: "erp-wfs3test-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** An active definition plus an approved authority limit for the approver (paise), set up by someone other than the approver. */
  async function setup(tenant: string, approver: string, limitPaise: number): Promise<void> {
    await withTransaction(owner, async (c) => {
      await c.query("INSERT INTO wf_definitions (tenant_id, doc_type, version, status, machine, effective_from, created_by, activated_by, activated_at) VALUES ($1, 'po', 1, 'active', $2, '2026-01-01', 'ACME00001', 'ACME00002', now())", [tenant, JSON.stringify(machine)]);
      await c.query(
        "INSERT INTO iam_authority_limits (tenant_id, user_ref, doc_type, max_amount_paise, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, 'po', $3, '2026-01-01', 'ACME00001', 'ACME00002', 'approved', 'Authority for purchase orders')",
        [tenant, approver, limitPaise],
      );
    }, { tenantId: tenant });
  }

  async function submitToReview(ctx: RequestContext, docId: string, reviewer: string, amountRupees: number, extra: Partial<Parameters<typeof startWorkflow>[2]> = {}) {
    const s = await startWorkflow(app, ctx, { docType: "po", docId, submittedBy: ctx.userId, amount: amountRupees, assignees: { originator: ctx.userId }, ...extra });
    await actOnWorkflow(app, ctx, { instanceId: s.instanceId, action: "submit", actor: ctx.userId, expectedVersion: 1, idempotencyKey: key(), assignees: { review: reviewer } });
    return s.instanceId;
  }

  it("lets a delegate act for the approver, records both, and refuses when the approver's limit does not cover the amount", async () => {
    const tenant = randomUUID();
    await setup(tenant, "ACME00010", 5_000_000);
    const approver = contextFor(tenant, "ACME00010");
    await delegateApprovals(app, approver, { delegate: "ACME00011", docType: "po", validFrom: "2026-01-01T00:00:00Z", validTo: "2099-01-01T00:00:00Z", reason: "Away on site inspection" });
    const requester = contextFor(tenant, "ACME00003");
    const small = await submitToReview(requester, "PO-DEL-1", "ACME00010", 20000);
    const done = await actOnWorkflow(app, contextFor(tenant, "ACME00011"), { instanceId: small, action: "approve", actor: "ACME00011", expectedVersion: 2, idempotencyKey: key() });
    expect(done.state).toBe("approved");
    const logged = await withTransaction(app, (c) => c.query<{ actor: string; on_behalf_of: string }>("SELECT actor, on_behalf_of FROM wf_action_log WHERE instance_id = $1 AND action = 'approve'", [small]), { tenantId: tenant });
    expect(logged.rows[0]).toEqual({ actor: "ACME00011", on_behalf_of: "ACME00010" });

    const large = await submitToReview(requester, "PO-DEL-2", "ACME00010", 1_000_000);
    await expectRefused(actOnWorkflow(app, contextFor(tenant, "ACME00011"), { instanceId: large, action: "approve", actor: "ACME00011", expectedVersion: 2, idempotencyKey: key() }), "FORBIDDEN", "authority does not cover");
  });

  it("refuses a person who is not the step's approver or their delegate, and a delegate's delegate (one hop)", async () => {
    const tenant = randomUUID();
    await setup(tenant, "ACME00010", 9_000_000);
    await delegateApprovals(app, contextFor(tenant, "ACME00010"), { delegate: "ACME00011", docType: null, validFrom: "2026-01-01T00:00:00Z", validTo: "2099-01-01T00:00:00Z", reason: "Away on site inspection" });
    await delegateApprovals(app, contextFor(tenant, "ACME00011"), { delegate: "ACME00012", docType: null, validFrom: "2026-01-01T00:00:00Z", validTo: "2099-01-01T00:00:00Z", reason: "Covering the delegation" });
    const id = await submitToReview(contextFor(tenant, "ACME00003"), "PO-HOP", "ACME00010", 20000);
    await expectRefused(actOnWorkflow(app, contextFor(tenant, "ACME00012"), { instanceId: id, action: "approve", actor: "ACME00012", expectedVersion: 2, idempotencyKey: key() }), "FORBIDDEN", "assigned to someone else");
    await expectRefused(actOnWorkflow(app, contextFor(tenant, "ACME00013"), { instanceId: id, action: "approve", actor: "ACME00013", expectedVersion: 2, idempotencyKey: key() }), "FORBIDDEN", "assigned to someone else");
  });

  it("recalls a document before anyone has acted, and refuses a recall after someone has", async () => {
    const tenant = randomUUID();
    await setup(tenant, "ACME00010", 9_000_000);
    const requester = contextFor(tenant, "ACME00003");
    const first = await submitToReview(requester, "PO-RC-1", "ACME00010", 20000);
    const recalled = await actOnWorkflow(app, requester, { instanceId: first, action: "recall", actor: "ACME00003", expectedVersion: 2, idempotencyKey: key(), comment: "Wrong quantity, correcting it" });
    expect(recalled.state).toBe("draft");

    const second = await submitToReview(requester, "PO-RC-2", "ACME00010", 20000);
    await actOnWorkflow(app, contextFor(tenant, "ACME00010"), { instanceId: second, action: "return", actor: "ACME00010", expectedVersion: 2, idempotencyKey: key(), reasonCode: "MISSING_INFO", comment: "Please attach the quotations", assignees: { originator: "ACME00003" } });
    await actOnWorkflow(app, requester, { instanceId: second, action: "resubmit", actor: "ACME00003", expectedVersion: 3, idempotencyKey: key(), assignees: { review: "ACME00010" } });
    await expectRefused(actOnWorkflow(app, requester, { instanceId: second, action: "recall", actor: "ACME00003", expectedVersion: 4, idempotencyKey: key(), comment: "Too late to recall this" }), "VALIDATION_FAILED", "already acted");
  });

  it("reassigns an open step to someone without another step, and refuses a person who already holds one", async () => {
    const tenant = randomUUID();
    await setup(tenant, "ACME00010", 9_000_000);
    const id = await submitToReview(contextFor(tenant, "ACME00003"), "PO-RA-1", "ACME00010", 20000);
    const moved = await reassignStep(app, contextFor(tenant, "ACME00100"), { instanceId: id, expectedVersion: 2, newAssignee: "ACME00020", reason: "Approver is unavailable this week" });
    expect(moved.stateVersion).toBe(3);
    const holder = await withTransaction(app, (c) => c.query<{ assignee: string }>("SELECT assignee FROM wf_tasks WHERE instance_id = $1 AND step = 'review' AND status = 'open'", [id]), { tenantId: tenant });
    expect(holder.rows[0].assignee).toBe("ACME00020");
    await expectRefused(reassignStep(app, contextFor(tenant, "ACME00100"), { instanceId: id, expectedVersion: 3, newAssignee: "ACME00003", reason: "Giving it back to the submitter" }), "FORBIDDEN", "already holds a step");
  });

  it("returns an expired step to the originator and never approves it; reminders are sent once", async () => {
    const tenant = randomUUID();
    await setup(tenant, "ACME00010", 9_000_000);
    const id = await submitToReview(contextFor(tenant, "ACME00003"), "PO-SLA-1", "ACME00010", 20000);
    const later = new Date(Date.now() + 30 * 86_400_000);
    const first = await sweepSla(app, contextFor(tenant, "ACME00100"), later);
    expect(first.returned).toBe(1);
    expect(first.reminders).toBe(2);
    const state = await withTransaction(app, (c) => c.query<{ state: string; closed_at: Date | null }>("SELECT state, closed_at FROM wf_instances WHERE id = $1", [id]), { tenantId: tenant });
    expect(state.rows[0]).toEqual({ state: "draft", closed_at: null });
    const again = await sweepSla(app, contextFor(tenant, "ACME00100"), later);
    expect(again.reminders).toBe(0);
    expect(again.returned).toBe(0);
  });

  it("amends only an approved record, and records the changes computed from the two versions", async () => {
    const tenant = randomUUID();
    await setup(tenant, "ACME00010", 9_000_000);
    const requester = contextFor(tenant, "ACME00003");
    const approved = await submitToReview(requester, "PO-AM-1", "ACME00010", 20000);
    await actOnWorkflow(app, contextFor(tenant, "ACME00010"), { instanceId: approved, action: "approve", actor: "ACME00010", expectedVersion: 2, idempotencyKey: key() });
    const amend = await startWorkflow(app, requester, { docType: "po", docId: "PO-AM-1", submittedBy: "ACME00003", amount: 25000, assignees: { originator: "ACME00003" }, amendment: { of: approved, before: { qty: 40, rate: 100 }, after: { qty: 45, rate: 100 } } });
    const row = await withTransaction(app, (c) => c.query<{ amendment_of: string; change_summary: { field: string }[] }>("SELECT amendment_of, change_summary FROM wf_instances WHERE id = $1", [amend.instanceId]), { tenantId: tenant });
    expect(Number(row.rows[0].amendment_of)).toBe(approved);
    expect(row.rows[0].change_summary.map((c) => c.field)).toEqual(["qty"]);

    const rejected = await submitToReview(contextFor(tenant, "ACME00004"), "PO-AM-2", "ACME00010", 20000);
    await actOnWorkflow(app, contextFor(tenant, "ACME00010"), { instanceId: rejected, action: "reject", actor: "ACME00010", expectedVersion: 2, idempotencyKey: key(), reasonCode: "RATE_TOO_HIGH", comment: "Rate is above the benchmark" });
    await expectRefused(startWorkflow(app, contextFor(tenant, "ACME00004"), { docType: "po", docId: "PO-AM-2", submittedBy: "ACME00004", amount: 20000, assignees: { originator: "ACME00004" }, amendment: { of: rejected, before: { qty: 1 }, after: { qty: 2 } } }), "VALIDATION_FAILED", "only an approved record");
  });

  it("flags an emergency approval past its deadline until someone other than the submitter regularises it", async () => {
    const tenant = randomUUID();
    await setup(tenant, "ACME00010", 9_000_000);
    const requester = contextFor(tenant, "ACME00003");
    const emergency = await startWorkflow(app, requester, { docType: "po", docId: "PO-EM-1", submittedBy: "ACME00003", amount: 20000, assignees: { originator: "ACME00003" }, emergency: { dueAt: "2026-10-01T00:00:00Z", reason: "Pump failure, concrete pour at risk" } });
    await actOnWorkflow(app, requester, { instanceId: emergency.instanceId, action: "submit", actor: "ACME00003", expectedVersion: 1, idempotencyKey: key(), assignees: { review: "ACME00010" } });
    expect((await overdueEmergencies(app, requester)).map((o) => o.instanceId)).toContain(emergency.instanceId);
    await expectRefused(regulariseEmergency(app, requester, { instanceId: emergency.instanceId, note: "Regularising my own emergency" }), "MAKER_CHECKER_REQUIRED");
    await regulariseEmergency(app, contextFor(tenant, "ACME00010"), { instanceId: emergency.instanceId, note: "Reviewed after the pour; quantities confirmed" });
    expect((await overdueEmergencies(app, requester)).map((o) => o.instanceId)).not.toContain(emergency.instanceId);
  });
});
