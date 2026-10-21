// Activity timeline (Part 13 REQ-DASH-F14; A-100). A read-only view of the audit chain: the chain is the record, the timeline is only a
// way of reading it. Entries are newest first. A change made by someone else is shown as restricted activity unless the viewer may see
// people; the content of a restricted entry is never shown. The project timeline includes the activity of the project's sites.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { recordTimeline } from "../secgov/audit";
import { can } from "../iam/pdp";
import { allocatedScopes } from "../org/allocations";
import type { DataLabel } from "./types";

export interface TimelineEntry {
  at: string;
  who: string;
  what: string;
  reason: string | null;
  restricted: boolean;
  module: string;
}

/** A readable sentence from an action code, for example `org.project.created` → "Project created". */
export function humanise(action: string): string {
  const parts = action.split(".");
  const last = parts[parts.length - 1].replace(/_/g, " ");
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** The fields a timeline entry needs. Both the record and the project timeline supply these. */
interface TimelineSource {
  occurredAt: Date;
  actorRef: string;
  module: string;
  action: string;
  reason: string | null;
}

async function toEntries(pool: Pool, ctx: RequestContext, rows: TimelineSource[]): Promise<TimelineEntry[]> {
  const people = await can(pool, ctx, "srch.people.view");
  return rows.map((r) => {
    const own = r.actorRef === ctx.userId;
    const restricted = !own && !people.allowed;
    return {
      at: r.occurredAt.toISOString(),
      who: restricted ? "Restricted" : r.actorRef,
      what: restricted ? "restricted activity" : humanise(r.action),
      reason: restricted ? null : r.reason,
      restricted,
      module: r.module,
    };
  });
}

/** The timeline of one record, newest first. The data label of a timeline is ACTUAL: it is the recorded history. */
export async function entityTimeline(pool: Pool, ctx: RequestContext, entity: { entityType: "project" | "site" | "person"; entityId: string }, limit = 200): Promise<{ label: DataLabel; entries: TimelineEntry[] }> {
  const rows = await recordTimeline(pool, ctx, entity.entityType, entity.entityId, limit);
  return { label: "ACTUAL", entries: await toEntries(pool, ctx, rows.map((r) => ({ occurredAt: r.occurredAt, actorRef: r.actorRef, module: r.module, action: r.action, reason: r.reason }))) };
}

/**
 * The project timeline: the project's own activity and that of its sites. A viewer sees it only for a project they are allocated to
 * (or with the scope permission); otherwise the timeline is empty, and says nothing about whether the project exists.
 */
export async function projectTimeline(pool: Pool, ctx: RequestContext, projectId: string, now: Date = new Date(), limit = 200): Promise<{ label: DataLabel; entries: TimelineEntry[] }> {
  const all = await can(pool, ctx, "srch.scope.all");
  if (!all.allowed) {
    const scopes = await allocatedScopes(pool, ctx, ctx.userId, now.toISOString().slice(0, 10));
    if (!scopes.some((s) => String(s.projectId) === projectId)) return { label: "ACTUAL", entries: [] };
  }
  const rows = await withTransaction(
    pool,
    (c) => c.query<{ seq: string; occurred_at: Date; actor_ref: string; module: string; action: string; reason: string | null; entity_type: string; entity_id: string }>(
      `SELECT seq, occurred_at, actor_ref, module, action, reason, entity_type, entity_id FROM sec_audit_log
        WHERE tenant_id = $1 AND (
              (entity_type = 'project' AND entity_id = $2)
           OR (entity_type = 'site' AND entity_id IN (SELECT id::text FROM org_sites WHERE tenant_id = $1 AND project_id::text = $2)))
        ORDER BY occurred_at DESC, seq DESC LIMIT $3`,
      [ctx.tenantId, projectId, Math.min(limit, 1000)],
    ),
    { tenantId: ctx.tenantId },
  );
  const sources: TimelineSource[] = rows.rows.map((r) => ({ occurredAt: r.occurred_at, actorRef: r.actor_ref, module: r.module, action: r.action, reason: r.reason }));
  return { label: "ACTUAL", entries: await toEntries(pool, ctx, sources) };
}
