// Read side of the workflow (Part 16 REQ-WF-F12, F14). The inbox and the widget are built from the API data, not from a copy of the routing:
// the state, the path and the allowed actions all come from the stored definition.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { calendarSla } from "./sla";
import { SPLIT_WINDOW_DAYS, toPaise } from "./doa";
import type { InboxItem } from "./inbox";
import type { Machine } from "./machine";

/**
 * The open steps the signed-in person holds, directly or through a delegation that is in force now. Reads in a fixed number of queries,
 * whatever the number of items: the split check and the conflict check are set-based.
 */
export async function myInbox(pool: Pool, ctx: RequestContext, options: { docType?: string; limit?: number } = {}): Promise<InboxItem[]> {
  const limit = Math.min(options.limit ?? 100, 500);
  const now = new Date();
  return withTransaction(
    pool,
    async (client) => {
      const r = await client.query<{
        task_id: string; instance_id: string; doc_type: string; doc_id: string; step: string; amount_snapshot: string | null; submitted_by: string;
        emergency: boolean; due_at: Date | null; created_at: Date; assignee: string; split_key: string | null; prior_total: string; delegator: string | null;
      }>(
        `SELECT t.id AS task_id, t.instance_id, i.doc_type, i.doc_id, t.step, i.amount_snapshot, i.submitted_by, i.emergency, t.due_at, t.created_at,
                t.assignee, i.split_key,
                CASE WHEN t.assignee = $2 THEN NULL ELSE t.assignee END AS delegator,
                CASE WHEN i.split_key IS NULL THEN '0' ELSE (
                  SELECT COALESCE(SUM(p.amount_snapshot), 0)::text FROM wf_instances p
                   WHERE p.tenant_id = i.tenant_id AND p.split_key = i.split_key AND p.id <> i.id
                     AND p.submitted_at BETWEEN i.submitted_at - interval '${SPLIT_WINDOW_DAYS} days' AND i.submitted_at)
                END AS prior_total
           FROM wf_tasks t JOIN wf_instances i ON i.id = t.instance_id AND i.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1 AND t.status = 'open' AND i.closed_at IS NULL
            AND (t.assignee = $2 OR t.assignee IN (
                  SELECT delegator FROM wf_delegations WHERE tenant_id = $1 AND delegate = $2 AND revoked_at IS NULL
                     AND valid_from <= now() AND valid_to > now() AND (doc_type IS NULL OR doc_type = i.doc_type)))
            AND ($3::text IS NULL OR i.doc_type = $3)
          ORDER BY t.due_at NULLS LAST, t.id
          LIMIT $4`,
        [ctx.tenantId, ctx.userId, options.docType ?? null, limit],
      );
      const rows = r.rows;
      // One conflict check for the whole list: the viewer's earlier actions on these documents that an enforced rule sets against approval.
      const docIds = [...new Set(rows.map((x) => x.doc_id))];
      const conflicts = docIds.length === 0 ? [] : (await client.query<{ entity_id: string; entity_type: string }>(
        `SELECT DISTINCT l.entity_type, l.entity_id FROM iam_action_log l
           LEFT JOIN iam_actor_links k ON k.tenant_id = l.tenant_id AND k.actor_ref = l.actor_ref
          WHERE l.tenant_id = $1 AND l.entity_id = ANY($2::text[])
            AND COALESCE(k.person_ref, l.actor_ref) = COALESCE((SELECT person_ref FROM iam_actor_links WHERE tenant_id = $1 AND actor_ref = $3), $3)
            AND l.action_key IN (SELECT CASE WHEN left_action = 'wf.approve' THEN right_action ELSE left_action END FROM iam_sod_rules
                                  WHERE tenant_id = $1 AND enforcement = 'enforce' AND 'wf.approve' IN (left_action, right_action))`,
        [ctx.tenantId, docIds, ctx.userId],
      )).rows;
      const conflictSet = new Set(conflicts.map((c) => `${c.entity_type}|${c.entity_id}`));
      return rows.map((x): InboxItem => {
        const amountPaise = x.amount_snapshot === null ? null : toPaise(Number(x.amount_snapshot));
        const priorPaise = toPaise(Number(x.prior_total));
        return {
          taskId: Number(x.task_id),
          instanceId: Number(x.instance_id),
          docType: x.doc_type,
          docId: x.doc_id,
          step: x.step,
          amountPaise,
          submittedBy: x.submitted_by,
          emergency: x.emergency,
          dueAt: x.due_at ? x.due_at.toISOString() : null,
          slaState: x.due_at ? calendarSla(x.created_at, x.due_at, now) : "none",
          delegatedFrom: x.delegator,
          sodWarning: conflictSet.has(`${x.doc_type}|${x.doc_id}`),
          // Earlier orders with the same split key inside the window. The band check itself runs when the step is approved.
          splitFinding: x.split_key !== null && priorPaise > 0,
        };
      });
    },
    { tenantId: ctx.tenantId },
  );
}

export interface WidgetView {
  instanceId: number;
  state: string;
  closed: boolean;
  path: string[];
  pending: { step: string; assignee: string; dueAt: string | null }[];
  history: { action: string; actor: string; onBehalfOf: string | null; at: string; reasonCode: string | null; comment: string | null }[];
  allowedActions: string[];
  comments: { author: string; body: string; at: string }[];
}

/** Everything the workflow widget shows, rendered from the stored definition and the instance's records. */
export async function workflowWidget(pool: Pool, ctx: RequestContext, docType: string, docId: string): Promise<WidgetView | null> {
  return withTransaction(
    pool,
    async (client) => {
      const inst = await client.query<{ id: string; state: string; definition_version: number; closed_at: Date | null }>(
        "SELECT id, state, definition_version, closed_at FROM wf_instances WHERE tenant_id = $1 AND doc_type = $2 AND doc_id = $3 ORDER BY id DESC LIMIT 1",
        [ctx.tenantId, docType, docId],
      );
      if (inst.rowCount === 0) return null;
      const i = inst.rows[0];
      const def = await client.query<{ machine: Machine }>("SELECT machine FROM wf_definitions WHERE tenant_id = $1 AND doc_type = $2 AND version = $3", [ctx.tenantId, docType, i.definition_version]);
      const machine = def.rows[0].machine;
      const pending = await client.query<{ step: string; assignee: string; due_at: Date | null }>(
        "SELECT step, assignee, due_at FROM wf_tasks WHERE tenant_id = $1 AND instance_id = $2 AND status = 'open' ORDER BY id",
        [ctx.tenantId, Number(i.id)],
      );
      const history = await client.query<{ action: string; actor: string; on_behalf_of: string | null; at: Date; reason_code: string | null; comment: string | null }>(
        "SELECT action, actor, on_behalf_of, at, reason_code, comment FROM wf_action_log WHERE tenant_id = $1 AND instance_id = $2 ORDER BY state_version_after",
        [ctx.tenantId, Number(i.id)],
      );
      const comments = await client.query<{ author: string; body: string; created_at: Date }>(
        "SELECT author, body, created_at FROM wf_comments WHERE tenant_id = $1 AND instance_id = $2 ORDER BY id",
        [ctx.tenantId, Number(i.id)],
      );
      const transitions = machine.transitions.filter((t) => t.from === i.state).map((t) => t.action);
      const path = [...new Set([machine.initial, ...history.rows.map((h) => h.action)])];
      return {
        instanceId: Number(i.id),
        state: i.state,
        closed: i.closed_at !== null,
        path,
        pending: pending.rows.map((p) => ({ step: p.step, assignee: p.assignee, dueAt: p.due_at ? p.due_at.toISOString() : null })),
        history: history.rows.map((h) => ({ action: h.action, actor: h.actor, onBehalfOf: h.on_behalf_of, at: h.at.toISOString(), reasonCode: h.reason_code, comment: h.comment })),
        allowedActions: i.closed_at ? [] : transitions,
        comments: comments.rows.map((c) => ({ author: c.author, body: c.body, at: c.created_at.toISOString() })),
      };
    },
    { tenantId: ctx.tenantId },
  );
}
