// Security events (Part 08 slice S2; REQ-SECGOV-F06; CP-SECGOV-06). Rules read the login history and the audit chain and raise
// one event per subject per open window. Events move OPEN → ACKNOWLEDGED → RESOLVED or FALSE_POSITIVE; each move is recorded,
// with a reason for the two closing states.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { can } from "../iam/pdp";
import { writeAudit } from "./audit";

export type Severity = "low" | "medium" | "high" | "critical";
export type EventStatus = "open" | "acknowledged" | "resolved" | "false_positive";

export const SECURITY_PERMISSIONS = [
  { key: "secgov.security.view", module: "secgov", description: "View security events and login history", stage: "MONITOR", sensitivity: "sensitive" },
  { key: "secgov.security.manage", module: "secgov", description: "Acknowledge, resolve or close security events", stage: "MONITOR", sensitivity: "privileged" },
] as const;

/** Allowed status moves. Closed states are final. */
export const STATUS_MOVES: Record<EventStatus, readonly EventStatus[]> = {
  open: ["acknowledged", "false_positive"],
  acknowledged: ["resolved", "false_positive"],
  resolved: [],
  false_positive: [],
};

/** Detection thresholds. Each is an assumption (A-28) until the security lead confirms them. */
export const RULES = {
  BRUTE_FORCE: { windowMinutes: 15, failures: 5, severity: "high" as Severity },
  SPRAY: { windowMinutes: 15, distinctUsers: 10, severity: "high" as Severity },
  LOCKOUT: { windowMinutes: 60, severity: "medium" as Severity },
  TOKEN_REUSE: { windowMinutes: 1440, severity: "critical" as Severity },
  PRIVILEGED_CHANGE: { windowMinutes: 60, severity: "low" as Severity },
  BULK_EXPORT: { windowMinutes: 60, rows: 1000, severity: "medium" as Severity },
} as const;

async function raiseIfNew(client: PoolClient, tenantId: string, rule: string, severity: Severity, subject: string, windowMinutes: number, detail: Record<string, unknown>): Promise<boolean> {
  const res = await client.query(
    `INSERT INTO sec_security_events (tenant_id, rule_code, severity, subject_ref, detail)
     SELECT $1, $2, $3, $4, $5
      WHERE NOT EXISTS (SELECT 1 FROM sec_security_events e WHERE e.tenant_id = $1 AND e.rule_code = $2 AND e.subject_ref = $4
                          AND e.raised_at > now() - make_interval(mins => $6))`,
    [tenantId, rule, severity, subject, JSON.stringify(detail), windowMinutes],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Runs every detection rule over the recent history. Returns how many new events were raised. */
export async function detect(pool: Pool, ctx: RequestContext): Promise<number> {
  const allowed = await can(pool, ctx, "secgov.security.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  return withTransaction(
    pool,
    async (client) => {
      let raised = 0;
      const brute = await client.query<{ user_ref: string; n: string }>(
        `SELECT user_ref, count(*) AS n FROM sec_login_history WHERE tenant_id = $1 AND outcome IN ('failure','mfa_failed') AND user_ref IS NOT NULL
          AND occurred_at > now() - make_interval(mins => $2) GROUP BY user_ref HAVING count(*) >= $3`,
        [ctx.tenantId, RULES.BRUTE_FORCE.windowMinutes, RULES.BRUTE_FORCE.failures],
      );
      for (const r of brute.rows) if (await raiseIfNew(client, ctx.tenantId, "BRUTE_FORCE", RULES.BRUTE_FORCE.severity, r.user_ref, RULES.BRUTE_FORCE.windowMinutes, { failures: Number(r.n) })) raised += 1;

      const spray = await client.query<{ device_hash: string; users: string }>(
        `SELECT device_hash, count(DISTINCT user_ref) AS users FROM sec_login_history WHERE tenant_id = $1 AND outcome IN ('failure','mfa_failed','locked')
          AND device_hash IS NOT NULL AND occurred_at > now() - make_interval(mins => $2) GROUP BY device_hash HAVING count(DISTINCT user_ref) >= $3`,
        [ctx.tenantId, RULES.SPRAY.windowMinutes, RULES.SPRAY.distinctUsers],
      );
      for (const r of spray.rows) if (await raiseIfNew(client, ctx.tenantId, "SPRAY", RULES.SPRAY.severity, `device:${r.device_hash}`, RULES.SPRAY.windowMinutes, { users: Number(r.users) })) raised += 1;

      const locked = await client.query<{ user_ref: string }>(
        "SELECT DISTINCT user_ref FROM sec_login_history WHERE tenant_id = $1 AND outcome = 'locked' AND occurred_at > now() - make_interval(mins => $2)",
        [ctx.tenantId, RULES.LOCKOUT.windowMinutes],
      );
      for (const r of locked.rows) if (await raiseIfNew(client, ctx.tenantId, "LOCKOUT", RULES.LOCKOUT.severity, r.user_ref, RULES.LOCKOUT.windowMinutes, {})) raised += 1;

      const reuse = await client.query<{ user_ref: string }>(
        "SELECT DISTINCT user_ref FROM sec_login_history WHERE tenant_id = $1 AND outcome = 'token_reuse' AND occurred_at > now() - make_interval(mins => $2)",
        [ctx.tenantId, RULES.TOKEN_REUSE.windowMinutes],
      );
      for (const r of reuse.rows) if (await raiseIfNew(client, ctx.tenantId, "TOKEN_REUSE", RULES.TOKEN_REUSE.severity, r.user_ref, RULES.TOKEN_REUSE.windowMinutes, {})) raised += 1;

      const priv = await client.query<{ actor_ref: string; n: string }>(
        `SELECT actor_ref, count(*) AS n FROM sec_audit_log WHERE tenant_id = $1 AND (action IN ('iam.role_grant.approved','iam.elevation.approved','iam.sod_rule.enforce','iam.authority_limit.approved','iam.assignment.approved'))
          AND occurred_at > now() - make_interval(mins => $2) GROUP BY actor_ref`,
        [ctx.tenantId, RULES.PRIVILEGED_CHANGE.windowMinutes],
      );
      for (const r of priv.rows) if (await raiseIfNew(client, ctx.tenantId, "PRIVILEGED_CHANGE", RULES.PRIVILEGED_CHANGE.severity, r.actor_ref, RULES.PRIVILEGED_CHANGE.windowMinutes, { changes: Number(r.n) })) raised += 1;

      const exports = await client.query<{ user_ref: string; rows: string }>(
        `SELECT user_ref, sum(row_count) AS rows FROM iam_export_events WHERE tenant_id = $1 AND decision = 'allowed' AND occurred_at > now() - make_interval(mins => $2)
          GROUP BY user_ref HAVING sum(row_count) >= $3`,
        [ctx.tenantId, RULES.BULK_EXPORT.windowMinutes, RULES.BULK_EXPORT.rows],
      );
      for (const r of exports.rows) if (await raiseIfNew(client, ctx.tenantId, "BULK_EXPORT", RULES.BULK_EXPORT.severity, r.user_ref, RULES.BULK_EXPORT.windowMinutes, { rows: Number(r.rows) })) raised += 1;
      return raised;
    },
    { tenantId: ctx.tenantId },
  );
}

/** Events with their current status (the latest status row). Requires the view permission. */
export async function listEvents(pool: Pool, ctx: RequestContext, filter: { status?: EventStatus } = {}): Promise<{ id: number; rule: string; severity: Severity; subject: string; status: EventStatus; raisedAt: Date }[]> {
  const allowed = await can(pool, ctx, "secgov.security.view");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  const { rows } = await withTransaction(
    pool,
    (client) => client.query<{ id: string; rule_code: string; severity: Severity; subject_ref: string; status: EventStatus; raised_at: Date }>(
      `SELECT e.id, e.rule_code, e.severity, e.subject_ref, COALESCE(s.status, 'open') AS status, e.raised_at
         FROM sec_security_events e
         LEFT JOIN LATERAL (SELECT status FROM sec_security_event_status x WHERE x.event_id = e.id ORDER BY x.changed_at DESC, x.id DESC LIMIT 1) s ON true
        WHERE e.tenant_id = $1 AND ($2::text IS NULL OR COALESCE(s.status, 'open') = $2)
        ORDER BY e.raised_at DESC LIMIT 500`,
      [ctx.tenantId, filter.status ?? null],
    ),
    { tenantId: ctx.tenantId },
  );
  return rows.map((r) => ({ id: Number(r.id), rule: r.rule_code, severity: r.severity, subject: r.subject_ref, status: r.status, raisedAt: r.raised_at }));
}

/** Moves an event along the allowed path. Closing needs a reason of at least ten characters. The move is audited. */
export async function changeStatus(pool: Pool, ctx: RequestContext, input: { eventId: number; to: EventStatus; reason?: string }): Promise<void> {
  const allowed = await can(pool, ctx, "secgov.security.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  if ((input.to === "resolved" || input.to === "false_positive") && (!input.reason || input.reason.trim().length < 10)) {
    throw new AppError("VALIDATION_FAILED", "closing an event needs a reason of at least 10 characters", [{ field: "reason", message: "required" }]);
  }
  await runUnitOfWork(pool, ctx, async (uow) => {
    const current = await uow.client.query<{ status: EventStatus; rule_code: string }>(
      `SELECT COALESCE((SELECT status FROM sec_security_event_status x WHERE x.event_id = e.id ORDER BY x.changed_at DESC, x.id DESC LIMIT 1), 'open') AS status, e.rule_code
         FROM sec_security_events e WHERE e.id = $1 AND e.tenant_id = $2`,
      [input.eventId, ctx.tenantId],
    );
    if (current.rowCount === 0) throw new AppError("NOT_FOUND", "the event was not found");
    const from = current.rows[0].status;
    if (!STATUS_MOVES[from].includes(input.to)) throw new AppError("VALIDATION_FAILED", `an event cannot move from ${from} to ${input.to}`);
    await uow.client.query(
      "INSERT INTO sec_security_event_status (tenant_id, event_id, status, changed_by, reason) VALUES ($1, $2, $3, $4, $5)",
      [ctx.tenantId, input.eventId, input.to, ctx.userId, input.reason ?? null],
    );
    await writeAudit(uow.client, ctx, { action: "secgov.security_event.status_changed", entityType: "security_event", entityId: String(input.eventId), after: { from, to: input.to, rule: current.rows[0].rule_code }, reason: input.reason ?? null });
  });
}

/** One person's own login history (self-service). Anyone may read their own; reading another's needs the view permission. */
export async function loginHistory(pool: Pool, ctx: RequestContext, userRef: string, limit = 50): Promise<{ at: Date; outcome: string }[]> {
  if (userRef !== ctx.userId) {
    const allowed = await can(pool, ctx, "secgov.security.view");
    if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  }
  const { rows } = await withTransaction(
    pool,
    (client) => client.query<{ occurred_at: Date; outcome: string }>("SELECT occurred_at, outcome FROM sec_login_history WHERE tenant_id = $1 AND user_ref = $2 ORDER BY occurred_at DESC LIMIT $3", [ctx.tenantId, userRef, Math.min(limit, 200)]),
    { tenantId: ctx.tenantId },
  );
  return rows.map((r) => ({ at: r.occurred_at, outcome: r.outcome }));
}
