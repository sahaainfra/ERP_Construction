// Workflow engine (Part 16 REQ-WF-F01, F06, F07, F08, F09, F10; CP-WF-01, CP-WF-04, CP-WF-05). The only approval path in the application
// (A-146). Each action locks the instance, checks the expected state version and the idempotency key, applies the machine, and writes the
// task, the action log, the audit trail and the events in one transaction. Instances keep the definition version they started on (A-147).
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork, type UnitOfWork } from "../core/uow";
import { writeAudit } from "../secgov/audit";
import { addWorkingDays } from "./calendar";
import { activeDelegator, assertDelegatedAction, checkDelegationInput } from "./delegation";
import { changesOf, type FieldChange } from "./amend";
import { SPLIT_WINDOW_DAYS, toPaise } from "./doa";
import { nextState, validateMachine, type Action, type Machine } from "./machine";
import { assertNotSelfApproval, assertReason, takeAmountSnapshot } from "./rules";
import { buildEvidence, storeSnapshot } from "./evidence";

const TASK_STATUS: Record<Action, string> = { submit: "approved", resubmit: "approved", approve: "approved", reject: "rejected", return: "returned", cancel: "cancelled", recall: "cancelled" };
const AUDIT_ACTION: Record<Action, string> = {
  submit: "document.submitted",
  resubmit: "document.resubmitted",
  approve: "document.approved",
  reject: "document.rejected",
  return: "document.returned",
  cancel: "document.cancelled",
  recall: "document.recalled",
};

export interface StartInput {
  docType: string;
  docId: string;
  submittedBy: string;
  amount?: number;
  /** The person for each step. Approver resolution (Part 16 S2) replaces this map. */
  assignees: Record<string, string>;
  /** Facts the routing and simulation read (for example project, category). Stored with the instance. */
  context?: Record<string, string | number>;
  /** Vendor, material and project joined into the key cumulative evaluation groups by (A-149). */
  splitKey?: string;
  /** Starts an amendment of an approved instance. The summary is computed from the two versions (A-148). */
  amendment?: { of: number; before: Record<string, unknown>; after: Record<string, unknown> };
  /** Execute-first emergency path (PC-3). The regularisation deadline is required; there is no default (A-157). */
  emergency?: { dueAt: string; reason: string };
}

export interface ActInput {
  instanceId: number;
  action: Action;
  actor: string;
  /** The state version the person saw. A different version means someone acted first. */
  expectedVersion: number;
  idempotencyKey: string;
  comment?: string;
  reasonCode?: string;
  /** The person for the next step, when the action moves to one. The originator defaults to the submitter. */
  assignees?: Record<string, string>;
}

export interface InstanceView {
  instanceId: number;
  state: string;
  stateVersion: number;
  replayed: boolean;
}

interface Instance {
  id: string;
  state: string;
  state_version: number;
  definition_version: number;
  submitted_by: string;
  doc_type: string;
  doc_id: string;
  closed_at: Date | null;
  amount_snapshot: string | null;
}

/** Starts the active workflow for a document. Refuses a second open workflow for the same document. */
export async function startWorkflow(pool: Pool, ctx: RequestContext, input: StartInput): Promise<InstanceView> {
  return runUnitOfWork(pool, ctx, async (uow) => {
    const c = uow.client;
    const def = await c.query<{ version: number; machine: Machine }>(
      "SELECT version, machine FROM wf_definitions WHERE tenant_id = $1 AND doc_type = $2 AND status = 'active'",
      [ctx.tenantId, input.docType],
    );
    if (def.rowCount === 0) throw new AppError("NOT_FOUND", `no active workflow is defined for ${input.docType}`);
    const machine = def.rows[0].machine;
    const problems = validateMachine(machine);
    if (problems.length > 0) throw new AppError("VALIDATION_FAILED", `the workflow definition is not valid: ${problems.join("; ")}`);
    const snapshot = takeAmountSnapshot(input.amount);

    let changeSummary: FieldChange[] | null = null;
    if (input.amendment) {
      changeSummary = await amendmentSummary(c, ctx, input.docType, input.docId, input.amendment);
    }
    if (input.emergency) {
      if (input.emergency.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the emergency reason is too short");
      if (Number.isNaN(Date.parse(input.emergency.dueAt))) throw new AppError("VALIDATION_FAILED", "the regularisation deadline is not a date");
    }
    const now = new Date();
    const inserted = await c
      .query<{ id: string }>(
        `INSERT INTO wf_instances (tenant_id, doc_type, doc_id, definition_version, state, amount_snapshot, submitted_by, context_json, split_key,
                                   amendment_of, change_summary, emergency, emergency_due_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          ctx.tenantId,
          input.docType,
          input.docId,
          def.rows[0].version,
          machine.initial,
          snapshot,
          input.submittedBy,
          JSON.stringify(input.context ?? {}),
          input.splitKey ?? null,
          input.amendment?.of ?? null,
          changeSummary ? JSON.stringify(changeSummary) : null,
          input.emergency !== undefined,
          input.emergency?.dueAt ?? null,
        ],
      )
      .catch((e: { code?: string }) => {
        if (e.code === "23505") throw new AppError("CONFLICT", "a workflow is already open for this document");
        throw e;
      });
    const instanceId = Number(inserted.rows[0].id);
    const initial = machine.states[machine.initial];
    if (initial.kind === "step") {
      const assignee = input.assignees[initial.step];
      if (!assignee) throw new AppError("VALIDATION_FAILED", `no person is given for step ${initial.step}`);
      await assign(c, ctx, instanceId, initial.step, assignee, slaDue(now, initial.slaWorkingDays));
      await uow.emit({ eventType: "wf.task.assigned", payload: { instanceId, step: initial.step, assignee }, aggregateKey: `${input.docType}:${input.docId}` });
    }
    await writeAudit(c, ctx, { action: "document.submitted", entityType: "workflow", entityId: String(instanceId), after: { docType: input.docType, docId: input.docId, state: machine.initial, definitionVersion: def.rows[0].version, amendmentOf: input.amendment?.of ?? null, emergency: input.emergency !== undefined } });
    return { instanceId, state: machine.initial, stateVersion: 1, replayed: false };
  });
}

/** Applies one action on behalf of the signed-in person. */
export async function actOnWorkflow(pool: Pool, ctx: RequestContext, input: ActInput): Promise<InstanceView> {
  return runUnitOfWork(pool, ctx, (uow) => applyAction(uow, ctx, input, { system: false }));
}

/** Returns a step whose window has expired (A-158). Only the return action is possible here; nothing is approved. Used by the SLA sweep. */
export async function returnOnExpiry(pool: Pool, ctx: RequestContext, input: { instanceId: number; expectedVersion: number; taskId: number }): Promise<InstanceView> {
  return runUnitOfWork(pool, ctx, (uow) =>
    applyAction(uow, ctx, { instanceId: input.instanceId, action: "return", actor: "system:sla", expectedVersion: input.expectedVersion, idempotencyKey: `sla-${input.taskId}-${input.expectedVersion}`, comment: "The approval window expired, so the document was returned to the originator.", reasonCode: "SLA_EXPIRED" }, { system: true }),
  );
}

/** Moves an open step to another person (admin, with a reason). A person who already holds a step on the document cannot be given another. */
export async function reassignStep(pool: Pool, ctx: RequestContext, input: { instanceId: number; expectedVersion: number; newAssignee: string; reason: string }): Promise<InstanceView> {
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short", [{ field: "reason", message: "at least 10 characters" }]);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const c = uow.client;
    const i = await lockInstance(c, ctx, input.instanceId);
    await checkVersion(c, ctx, input.instanceId, i, input.expectedVersion);
    const machine = await machineFor(c, ctx, i);
    const step = machine.states[i.state];
    if (step.kind !== "step") throw new AppError("VALIDATION_FAILED", "this workflow has no open step");
    const open = await c.query<{ id: string; assignee: string }>("SELECT id, assignee FROM wf_tasks WHERE tenant_id = $1 AND instance_id = $2 AND step = $3 AND status = 'open'", [ctx.tenantId, input.instanceId, step.step]);
    if (open.rowCount === 0) throw new AppError("VALIDATION_FAILED", "there is no open step to reassign");
    if (open.rows[0].assignee === input.newAssignee) throw new AppError("VALIDATION_FAILED", "the step is already with that person");
    const held = await c.query("SELECT 1 FROM wf_tasks WHERE tenant_id = $1 AND instance_id = $2 AND assignee = $3", [ctx.tenantId, input.instanceId, input.newAssignee]);
    if (held.rowCount) throw new AppError("FORBIDDEN", "this person already holds a step on this document");
    await c.query("UPDATE wf_tasks SET assignee = $3 WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, open.rows[0].id, input.newAssignee]);
    const versionAfter = i.state_version + 1;
    await c.query("UPDATE wf_instances SET state_version = $3 WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, input.instanceId, versionAfter]);
    await c.query(
      `INSERT INTO wf_action_log (tenant_id, instance_id, task_id, action, actor, state_version_before, state_version_after, comment, reason_code)
       VALUES ($1, $2, $3, 'reassign', $4, $5, $6, $7, 'ADMIN_REASSIGN')`,
      [ctx.tenantId, input.instanceId, open.rows[0].id, ctx.userId, i.state_version, versionAfter, input.reason],
    );
    await uow.emit({ eventType: "wf.task.assigned", payload: { instanceId: input.instanceId, step: step.step, assignee: input.newAssignee }, aggregateKey: `${i.doc_type}:${i.doc_id}` });
    await writeAudit(c, ctx, { action: "document.reassigned", entityType: "workflow", entityId: String(input.instanceId), before: { assignee: open.rows[0].assignee }, after: { assignee: input.newAssignee }, reason: input.reason });
    return { instanceId: input.instanceId, state: i.state, stateVersion: versionAfter, replayed: false };
  });
}

/** Records the regularisation of an emergency approval (A-157). The submitter cannot regularise their own emergency. */
export async function regulariseEmergency(pool: Pool, ctx: RequestContext, input: { instanceId: number; note: string }): Promise<void> {
  if (input.note.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the note is too short");
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ emergency: boolean; regularised_at: Date | null; submitted_by: string; doc_type: string; doc_id: string }>(
      "SELECT emergency, regularised_at, submitted_by, doc_type, doc_id FROM wf_instances WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
      [ctx.tenantId, input.instanceId],
    );
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the workflow was not found");
    const row = found.rows[0];
    if (!row.emergency) throw new AppError("VALIDATION_FAILED", "this workflow is not an emergency approval");
    if (row.regularised_at) throw new AppError("CONFLICT", "this emergency approval is already regularised");
    if (row.submitted_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the submitter cannot regularise their own emergency approval");
    await uow.client.query("UPDATE wf_instances SET regularised_at = now(), regularised_by = $3 WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, input.instanceId, ctx.userId]);
    await uow.emit({ eventType: "wf.emergency.regularised", payload: { instanceId: input.instanceId }, aggregateKey: `${row.doc_type}:${row.doc_id}` });
    await writeAudit(uow.client, ctx, { action: "document.regularised", entityType: "workflow", entityId: String(input.instanceId), reason: input.note });
  });
}

/** Delegates the signed-in person's approvals for a period to one other person (one hop; A-156). */
export async function delegateApprovals(pool: Pool, ctx: RequestContext, input: { delegate: string; docType: string | null; validFrom: string; validTo: string; reason: string }): Promise<{ id: number }> {
  checkDelegationInput({ delegator: ctx.userId, ...input });
  return runUnitOfWork(pool, ctx, async (uow) => {
    const c = uow.client;
    // One hop: the delegate must not be delegating to anyone for the same period, and nobody may delegate to someone who is already a delegate.
    const delegateIsDelegating = await c.query("SELECT 1 FROM wf_delegations WHERE tenant_id = $1 AND delegator = $2 AND revoked_at IS NULL AND valid_to > $3::timestamptz", [ctx.tenantId, input.delegate, input.validFrom]);
    if (delegateIsDelegating.rowCount) throw new AppError("VALIDATION_FAILED", "the delegate is delegating their own approvals, which is one hop too many");
    const inserted = await c.query<{ id: string }>(
      "INSERT INTO wf_delegations (tenant_id, delegator, delegate, doc_type, valid_from, valid_to, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
      [ctx.tenantId, ctx.userId, input.delegate, input.docType, input.validFrom, input.validTo, input.reason, ctx.userId],
    );
    await writeAudit(c, ctx, { action: "document.delegated", entityType: "delegation", entityId: inserted.rows[0].id, after: { delegate: input.delegate, docType: input.docType, validFrom: input.validFrom, validTo: input.validTo }, reason: input.reason });
    return { id: Number(inserted.rows[0].id) };
  });
}

async function applyAction(uow: UnitOfWork, ctx: RequestContext, input: ActInput, opts: { system: boolean }): Promise<InstanceView> {
  const c = uow.client;
  const replay = await c.query<{ instance_id: string; state_version_after: number }>(
    "SELECT instance_id, state_version_after FROM wf_action_log WHERE tenant_id = $1 AND idempotency_key = $2",
    [ctx.tenantId, input.idempotencyKey],
  );
  if (replay.rowCount) {
    if (Number(replay.rows[0].instance_id) !== input.instanceId) throw new AppError("CONFLICT", "this request key was used for another document");
    const current = await c.query<{ state: string }>("SELECT state FROM wf_instances WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, input.instanceId]);
    return { instanceId: input.instanceId, state: current.rows[0].state, stateVersion: replay.rows[0].state_version_after, replayed: true };
  }
  const i = await lockInstance(c, ctx, input.instanceId);
  if (i.closed_at) throw new AppError("VALIDATION_FAILED", "this workflow is already closed");
  await checkVersion(c, ctx, input.instanceId, i, input.expectedVersion);
  const machine = await machineFor(c, ctx, i);
  const to = nextState(machine, i.state, input.action);
  if (!to) throw new AppError("VALIDATION_FAILED", `"${input.action}" is not allowed from ${i.state}`);
  if (input.action === "approve") assertNotSelfApproval(input.actor, i.submitted_by);
  assertReason(input.action, input.reasonCode, input.comment);
  const initialStep = machine.states[machine.initial].kind === "step" ? (machine.states[machine.initial] as { step: string }).step : null;
  const current = machine.states[i.state];
  if (current.kind !== "step") throw new AppError("VALIDATION_FAILED", "this workflow has no step to act on");

  let taskId: number;
  let onBehalfOf: string | null = null;
  if (input.action === "recall") {
    if (input.actor !== i.submitted_by) throw new AppError("FORBIDDEN", "only the submitter can recall a document");
    // The log is the record of who acted; a step reopened by resubmission no longer shows its earlier action on the task.
    const acted = await c.query("SELECT 1 FROM wf_action_log WHERE tenant_id = $1 AND instance_id = $2 AND action NOT IN ('submit', 'resubmit', 'recall')", [ctx.tenantId, input.instanceId]);
    if (acted.rowCount) throw new AppError("VALIDATION_FAILED", "someone has already acted on this document, so it cannot be recalled");
    const open = await c.query<{ id: string }>("SELECT id FROM wf_tasks WHERE tenant_id = $1 AND instance_id = $2 AND step = $3 AND status = 'open'", [ctx.tenantId, input.instanceId, current.step]);
    if (open.rowCount === 0) throw new AppError("VALIDATION_FAILED", "there is no open step to recall");
    taskId = Number(open.rows[0].id);
  } else {
    const open = await c.query<{ id: string; assignee: string }>("SELECT id, assignee FROM wf_tasks WHERE tenant_id = $1 AND instance_id = $2 AND step = $3 AND status = 'open'", [ctx.tenantId, input.instanceId, current.step]);
    if (open.rowCount === 0) throw new AppError("FORBIDDEN", "there is no open step for you to act on");
    taskId = Number(open.rows[0].id);
    if (!opts.system && open.rows[0].assignee !== input.actor) {
      const delegator = await activeDelegator(c, ctx.tenantId, input.actor, i.doc_type, new Date());
      if (delegator === null || delegator !== open.rows[0].assignee) throw new AppError("FORBIDDEN", "this step is assigned to someone else");
      await assertDelegatedAction(c, ctx.tenantId, { delegator, delegate: input.actor, docType: i.doc_type, docId: i.doc_id, amountPaise: i.amount_snapshot === null ? null : Math.round(Number(i.amount_snapshot) * 100), at: new Date() });
      onBehalfOf = delegator;
    }
  }
  await c.query(
    "UPDATE wf_tasks SET status = $3, acted_at = now(), acted_by = $4, comment = $5, reason_code = $6 WHERE tenant_id = $1 AND id = $2",
    [ctx.tenantId, taskId, TASK_STATUS[input.action], input.actor, input.comment ?? null, input.reasonCode ?? null],
  );

  const target = machine.states[to];
  const versionAfter = i.state_version + 1;
  await c.query(
    "UPDATE wf_instances SET state = $3, state_version = $4, closed_at = CASE WHEN $5::boolean THEN now() ELSE NULL END WHERE tenant_id = $1 AND id = $2",
    [ctx.tenantId, input.instanceId, to, versionAfter, target.kind === "terminal"],
  );
  await c.query(
    `INSERT INTO wf_action_log (tenant_id, instance_id, task_id, action, actor, state_version_before, state_version_after, comment, reason_code, idempotency_key, on_behalf_of)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [ctx.tenantId, input.instanceId, taskId, input.action, input.actor, i.state_version, versionAfter, input.comment ?? null, input.reasonCode ?? null, input.idempotencyKey, onBehalfOf],
  );

  if (input.action === "approve" || input.action === "reject") {
    // The panel the approver saw is stored with the decision (CP-WF-05). If it cannot be stored, the decision does not happen.
    const prior = await c.query<{ total: string }>(
      `SELECT COALESCE(SUM(p.amount_snapshot), 0)::text AS total FROM wf_instances i
         JOIN wf_instances p ON p.tenant_id = i.tenant_id AND p.split_key = i.split_key AND p.id <> i.id
          AND p.submitted_at BETWEEN i.submitted_at - interval '${SPLIT_WINDOW_DAYS} days' AND i.submitted_at
        WHERE i.tenant_id = $1 AND i.id = $2 AND i.split_key IS NOT NULL`,
      [ctx.tenantId, input.instanceId],
    );
    const history = await c.query<{ action: string; actor: string; at: Date }>("SELECT action, actor, at FROM wf_action_log WHERE tenant_id = $1 AND instance_id = $2 ORDER BY state_version_after", [ctx.tenantId, input.instanceId]);
    const view = buildEvidence({ docType: i.doc_type, amountPaise: i.amount_snapshot === null ? null : toPaise(Number(i.amount_snapshot)), priorPaise: toPaise(Number(prior.rows[0]?.total ?? 0)), history: history.rows.map((h) => ({ action: h.action, actor: h.actor, at: h.at.toISOString() })) });
    await storeSnapshot(c, ctx.tenantId, { instanceId: input.instanceId, taskId, action: input.action, actor: input.actor, view });
  }

  const aggregateKey = `${i.doc_type}:${i.doc_id}`;
  await uow.emit({ eventType: "wf.task.completed", payload: { instanceId: input.instanceId, taskId, action: input.action, onBehalfOf }, aggregateKey });
  if (target.kind === "step") {
    const assignee = input.assignees?.[target.step] ?? (target.step === initialStep ? i.submitted_by : undefined);
    if (!assignee) throw new AppError("VALIDATION_FAILED", `no person is given for step ${target.step}`);
    await assign(c, ctx, input.instanceId, target.step, assignee, slaDue(new Date(), target.slaWorkingDays));
    await uow.emit({ eventType: "wf.task.assigned", payload: { instanceId: input.instanceId, step: target.step, assignee }, aggregateKey });
  }
  await uow.emit({ eventType: "wf.instance.transitioned", payload: { instanceId: input.instanceId, from: i.state, to, stateVersion: versionAfter }, aggregateKey });
  if (target.kind === "terminal") await uow.emit({ eventType: "wf.instance.completed", payload: { instanceId: input.instanceId, outcome: target.outcome }, aggregateKey });
  await writeAudit(c, ctx, {
    action: AUDIT_ACTION[input.action],
    entityType: "workflow",
    entityId: String(input.instanceId),
    before: { state: i.state, stateVersion: i.state_version },
    after: { state: to, stateVersion: versionAfter, onBehalfOf },
    reasonCode: input.reasonCode ?? null,
    reason: input.comment ?? null,
  });
  return { instanceId: input.instanceId, state: to, stateVersion: versionAfter, replayed: false };
}

async function lockInstance(c: PoolClient, ctx: RequestContext, instanceId: number): Promise<Instance> {
  const inst = await c.query<Instance>(
    "SELECT id, state, state_version, definition_version, submitted_by, doc_type, doc_id, closed_at, amount_snapshot FROM wf_instances WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
    [ctx.tenantId, instanceId],
  );
  if (inst.rowCount === 0) throw new AppError("NOT_FOUND", "the workflow was not found");
  return inst.rows[0];
}

async function checkVersion(c: PoolClient, ctx: RequestContext, instanceId: number, i: Instance, expected: number): Promise<void> {
  if (expected === i.state_version) return;
  const last = await c.query<{ actor: string }>("SELECT actor FROM wf_action_log WHERE tenant_id = $1 AND instance_id = $2 ORDER BY state_version_after DESC LIMIT 1", [ctx.tenantId, instanceId]);
  throw new AppError("CONFLICT", last.rowCount ? `already actioned by ${last.rows[0].actor}` : "the workflow changed while you were editing it");
}

async function machineFor(c: PoolClient, ctx: RequestContext, i: Instance): Promise<Machine> {
  const def = await c.query<{ machine: Machine }>("SELECT machine FROM wf_definitions WHERE tenant_id = $1 AND doc_type = $2 AND version = $3", [ctx.tenantId, i.doc_type, i.definition_version]);
  return def.rows[0].machine;
}

async function amendmentSummary(c: PoolClient, ctx: RequestContext, docType: string, docId: string, amendment: { of: number; before: Record<string, unknown>; after: Record<string, unknown> }): Promise<FieldChange[]> {
  const prior = await c.query<{ state: string; definition_version: number; doc_type: string; doc_id: string; closed_at: Date | null }>(
    "SELECT state, definition_version, doc_type, doc_id, closed_at FROM wf_instances WHERE tenant_id = $1 AND id = $2",
    [ctx.tenantId, amendment.of],
  );
  if (prior.rowCount === 0) throw new AppError("NOT_FOUND", "the workflow being amended was not found");
  const p = prior.rows[0];
  if (p.doc_type !== docType || p.doc_id !== docId) throw new AppError("VALIDATION_FAILED", "the amendment must be for the same document");
  if (!p.closed_at) throw new AppError("VALIDATION_FAILED", "only a closed workflow can be amended");
  const machine = (await c.query<{ machine: Machine }>("SELECT machine FROM wf_definitions WHERE tenant_id = $1 AND doc_type = $2 AND version = $3", [ctx.tenantId, docType, p.definition_version])).rows[0].machine;
  if (machine.states[p.state]?.kind !== "terminal" || (machine.states[p.state] as { outcome: string }).outcome !== "approved") {
    throw new AppError("VALIDATION_FAILED", "only an approved record can be amended; a rejected or cancelled one cannot");
  }
  const summary = changesOf(amendment.before, amendment.after);
  if (summary.length === 0) throw new AppError("VALIDATION_FAILED", "nothing has changed, so there is nothing to amend");
  return summary;
}

function slaDue(from: Date, workingDays: number | undefined): Date | null {
  return workingDays === undefined ? null : addWorkingDays(from, workingDays);
}

/**
 * Gives a person a step. A person holds at most one step per instance (CP-WF-01). Returning to the same step reopens that person's
 * task; a different step is refused, whoever asks.
 */
async function assign(c: PoolClient, ctx: RequestContext, instanceId: number, step: string, assignee: string, dueAt: Date | null): Promise<void> {
  const existing = await c.query<{ id: string; step: string }>("SELECT id, step FROM wf_tasks WHERE tenant_id = $1 AND instance_id = $2 AND assignee = $3", [ctx.tenantId, instanceId, assignee]);
  if (existing.rowCount) {
    if (existing.rows[0].step !== step) throw new AppError("FORBIDDEN", "this person already acts at another level of this document");
    await c.query(
      "UPDATE wf_tasks SET status = 'open', acted_at = NULL, acted_by = NULL, comment = NULL, reason_code = NULL, created_at = now(), due_at = $3, reminded_50 = false, reminded_90 = false WHERE tenant_id = $1 AND id = $2",
      [ctx.tenantId, existing.rows[0].id, dueAt?.toISOString() ?? null],
    );
    return;
  }
  await c.query("INSERT INTO wf_tasks (tenant_id, instance_id, step, assignee, status, due_at) VALUES ($1, $2, $3, $4, 'open', $5)", [ctx.tenantId, instanceId, step, assignee, dueAt?.toISOString() ?? null]);
}
