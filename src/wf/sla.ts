// SLA sweep and monitoring (Part 16 REQ-WF-F08, CP-WF-07; A-151, A-158). Sends one reminder at 50 % and one at 90 % of a step's window. At
// expiry a step that is not the originator's is returned, never approved. Escalation ladders belong to Part 18 and are not run here.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { returnOnExpiry } from "./engine";
import { slaState } from "./calendar";

/** The SLA state of a task at a given time, for display. Tasks with no timer show "none" (see read.ts). */
export function calendarSla(createdAt: Date, dueAt: Date, now: Date): "running" | "reminder_50" | "reminder_90" | "expired" {
  return slaState(createdAt, dueAt, now);
}

export interface SweepResult {
  reminders: number;
  returned: number;
  heldAtOriginator: number;
}

/** One pass over the open steps with a timer. Safe to run again: each reminder is sent once, and a returned step is no longer open. */
export async function sweepSla(pool: Pool, ctx: RequestContext, asOf: Date = new Date()): Promise<SweepResult> {
  const { rows } = await withTransaction(
    pool,
    (client) =>
      client.query<{ task_id: string; instance_id: string; step: string; created_at: Date; due_at: Date; reminded_50: boolean; reminded_90: boolean; state_version: number; state: string; initial_step: string | null }>(
        `SELECT t.id AS task_id, t.instance_id, t.step, t.created_at, t.due_at, t.reminded_50, t.reminded_90, i.state_version, i.state,
                (SELECT d.machine->'states'->(d.machine->>'initial')->>'step' FROM wf_definitions d WHERE d.tenant_id = i.tenant_id AND d.doc_type = i.doc_type AND d.version = i.definition_version) AS initial_step
           FROM wf_tasks t JOIN wf_instances i ON i.id = t.instance_id AND i.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1 AND t.status = 'open' AND t.due_at IS NOT NULL AND i.closed_at IS NULL`,
        [ctx.tenantId],
      ),
    { tenantId: ctx.tenantId },
  );
  const result: SweepResult = { reminders: 0, returned: 0, heldAtOriginator: 0 };
  for (const t of rows) {
    const state = slaState(t.created_at, t.due_at, asOf);
    if (state === "running") continue;
    if ((state === "reminder_50" || state === "reminder_90" || state === "expired") && !t.reminded_50) {
      await markReminder(pool, ctx, Number(t.task_id), 50);
      result.reminders++;
    }
    if ((state === "reminder_90" || state === "expired") && !t.reminded_90) {
      await markReminder(pool, ctx, Number(t.task_id), 90);
      result.reminders++;
    }
    if (state !== "expired") continue;
    if (t.step === t.initial_step) {
      result.heldAtOriginator++;
      continue;
    }
    try {
      await returnOnExpiry(pool, ctx, { instanceId: Number(t.instance_id), expectedVersion: t.state_version, taskId: Number(t.task_id) });
      result.returned++;
    } catch (e) {
      if (!(e instanceof AppError) || e.code !== "CONFLICT") throw e;
      // Someone acted first. The step is no longer waiting, so nothing is returned.
    }
  }
  return result;
}

async function markReminder(pool: Pool, ctx: RequestContext, taskId: number, level: 50 | 90): Promise<void> {
  await runUnitOfWork(pool, ctx, async (uow) => {
    const column = level === 50 ? "reminded_50" : "reminded_90";
    await uow.client.query(`UPDATE wf_tasks SET ${column} = true WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, taskId]);
    const task = await uow.client.query<{ assignee: string; instance_id: string }>("SELECT assignee, instance_id FROM wf_tasks WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, taskId]);
    await uow.emit({ eventType: "wf.task.overdue", payload: { taskId, level, assignee: task.rows[0].assignee, instanceId: Number(task.rows[0].instance_id) } });
  });
}

/** Emergency approvals past their regularisation deadline and not yet regularised (CP-WF-07). Reported for Part 18 to escalate. */
export async function overdueEmergencies(pool: Pool, ctx: RequestContext, asOf: Date = new Date()): Promise<{ instanceId: number; dueAt: string }[]> {
  const { rows } = await withTransaction(
    pool,
    (client) =>
      client.query<{ id: string; emergency_due_at: Date }>(
        "SELECT id, emergency_due_at FROM wf_instances WHERE tenant_id = $1 AND emergency AND regularised_at IS NULL AND emergency_due_at < $2::timestamptz ORDER BY emergency_due_at",
        [ctx.tenantId, asOf.toISOString()],
      ),
    { tenantId: ctx.tenantId },
  );
  return rows.map((r) => ({ instanceId: Number(r.id), dueAt: r.emergency_due_at.toISOString() }));
}
