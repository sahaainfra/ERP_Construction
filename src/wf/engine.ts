// Workflow engine (Part 16 REQ-WF-F01, F06, F15; CP-WF-01, CP-WF-04, CP-WF-05). The only approval path in the application (A-146).
// Each action locks the instance, checks the expected state version and the idempotency key, applies the machine, and writes the task,
// the action log, the audit trail and the events in one transaction. Instances keep the definition version they started on (A-147).
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { writeAudit } from "../secgov/audit";
import { nextState, validateMachine, type Action, type Machine } from "./machine";
import { assertNotSelfApproval, assertReason, takeAmountSnapshot } from "./rules";

const TASK_STATUS: Record<Action, string> = { submit: "approved", resubmit: "approved", approve: "approved", reject: "rejected", return: "returned", cancel: "cancelled" };
const AUDIT_ACTION: Record<Action, string> = {
  submit: "document.submitted",
  resubmit: "document.resubmitted",
  approve: "document.approved",
  reject: "document.rejected",
  return: "document.returned",
  cancel: "document.cancelled",
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
  /** The person for the next step, when the action moves to one. */
  assignees?: Record<string, string>;
}

export interface InstanceView {
  instanceId: number;
  state: string;
  stateVersion: number;
  replayed: boolean;
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
    const inserted = await c
      .query<{ id: string }>(
        `INSERT INTO wf_instances (tenant_id, doc_type, doc_id, definition_version, state, amount_snapshot, submitted_by, context_json, split_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [ctx.tenantId, input.docType, input.docId, def.rows[0].version, machine.initial, snapshot, input.submittedBy, JSON.stringify(input.context ?? {}), input.splitKey ?? null],
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
      await assign(c, ctx, instanceId, initial.step, assignee);
      await uow.emit({ eventType: "wf.task.assigned", payload: { instanceId, step: initial.step, assignee }, aggregateKey: `${input.docType}:${input.docId}` });
    }
    await writeAudit(c, ctx, { action: "document.submitted", entityType: "workflow", entityId: String(instanceId), after: { docType: input.docType, docId: input.docId, state: machine.initial, definitionVersion: def.rows[0].version } });
    return { instanceId, state: machine.initial, stateVersion: 1, replayed: false };
  });
}

/** Applies one action. Replaying the same idempotency key returns the first result and records nothing new. */
export async function actOnWorkflow(pool: Pool, ctx: RequestContext, input: ActInput): Promise<InstanceView> {
  return runUnitOfWork(pool, ctx, async (uow) => {
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
    const inst = await c.query<{ state: string; state_version: number; definition_version: number; submitted_by: string; doc_type: string; doc_id: string; closed_at: Date | null }>(
      "SELECT state, state_version, definition_version, submitted_by, doc_type, doc_id, closed_at FROM wf_instances WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
      [ctx.tenantId, input.instanceId],
    );
    if (inst.rowCount === 0) throw new AppError("NOT_FOUND", "the workflow was not found");
    const i = inst.rows[0];
    if (i.closed_at) throw new AppError("VALIDATION_FAILED", "this workflow is already closed");
    if (input.expectedVersion !== i.state_version) {
      const last = await c.query<{ actor: string }>("SELECT actor FROM wf_action_log WHERE tenant_id = $1 AND instance_id = $2 ORDER BY state_version_after DESC LIMIT 1", [ctx.tenantId, input.instanceId]);
      throw new AppError("CONFLICT", last.rowCount ? `already actioned by ${last.rows[0].actor}` : "the workflow changed while you were editing it");
    }
    const def = await c.query<{ machine: Machine }>("SELECT machine FROM wf_definitions WHERE tenant_id = $1 AND doc_type = $2 AND version = $3", [ctx.tenantId, i.doc_type, i.definition_version]);
    const machine = def.rows[0].machine;
    const to = nextState(machine, i.state, input.action);
    if (!to) throw new AppError("VALIDATION_FAILED", `"${input.action}" is not allowed from ${i.state}`);
    if (input.action === "approve") assertNotSelfApproval(input.actor, i.submitted_by);
    assertReason(input.action, input.reasonCode, input.comment);

    const current = machine.states[i.state];
    if (current.kind !== "step") throw new AppError("VALIDATION_FAILED", "this workflow has no step to act on");
    const open = await c.query<{ id: string; assignee: string }>(
      "SELECT id, assignee FROM wf_tasks WHERE tenant_id = $1 AND instance_id = $2 AND step = $3 AND status = 'open'",
      [ctx.tenantId, input.instanceId, current.step],
    );
    if (open.rowCount === 0) throw new AppError("FORBIDDEN", "there is no open step for you to act on");
    if (open.rows[0].assignee !== input.actor) throw new AppError("FORBIDDEN", "this step is assigned to someone else");
    const taskId = Number(open.rows[0].id);
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
      `INSERT INTO wf_action_log (tenant_id, instance_id, task_id, action, actor, state_version_before, state_version_after, comment, reason_code, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [ctx.tenantId, input.instanceId, taskId, input.action, input.actor, i.state_version, versionAfter, input.comment ?? null, input.reasonCode ?? null, input.idempotencyKey],
    );

    const aggregateKey = `${i.doc_type}:${i.doc_id}`;
    await uow.emit({ eventType: "wf.task.completed", payload: { instanceId: input.instanceId, taskId, action: input.action }, aggregateKey });
    if (target.kind === "step") {
      const assignee = input.assignees?.[target.step];
      if (!assignee) throw new AppError("VALIDATION_FAILED", `no person is given for step ${target.step}`);
      await assign(c, ctx, input.instanceId, target.step, assignee);
      await uow.emit({ eventType: "wf.task.assigned", payload: { instanceId: input.instanceId, step: target.step, assignee }, aggregateKey });
    }
    await uow.emit({ eventType: "wf.instance.transitioned", payload: { instanceId: input.instanceId, from: i.state, to, stateVersion: versionAfter }, aggregateKey });
    if (target.kind === "terminal") await uow.emit({ eventType: "wf.instance.completed", payload: { instanceId: input.instanceId, outcome: target.outcome }, aggregateKey });
    await writeAudit(c, ctx, {
      action: AUDIT_ACTION[input.action],
      entityType: "workflow",
      entityId: String(input.instanceId),
      before: { state: i.state, stateVersion: i.state_version },
      after: { state: to, stateVersion: versionAfter },
      reasonCode: input.reasonCode ?? null,
      reason: input.comment ?? null,
    });
    return { instanceId: input.instanceId, state: to, stateVersion: versionAfter, replayed: false };
  });
}

/**
 * Gives a person a step. A person holds at most one step per instance (CP-WF-01). Returning to the same step reopens that person's
 * task; a different step is refused, whoever asks.
 */
async function assign(c: PoolClient, ctx: RequestContext, instanceId: number, step: string, assignee: string): Promise<void> {
  const existing = await c.query<{ id: string; step: string }>("SELECT id, step FROM wf_tasks WHERE tenant_id = $1 AND instance_id = $2 AND assignee = $3", [ctx.tenantId, instanceId, assignee]);
  if (existing.rowCount) {
    if (existing.rows[0].step !== step) throw new AppError("FORBIDDEN", "this person already acts at another level of this document");
    await c.query("UPDATE wf_tasks SET status = 'open', acted_at = NULL, acted_by = NULL, comment = NULL, reason_code = NULL WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, existing.rows[0].id]);
    return;
  }
  await c.query("INSERT INTO wf_tasks (tenant_id, instance_id, step, assignee, status) VALUES ($1, $2, $3, $4, 'open')", [ctx.tenantId, instanceId, step, assignee]);
}
