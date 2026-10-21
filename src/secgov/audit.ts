// Audit chain (Part 08 slice S1; REQ-SECGOV-F01, F02, F04, F05; CP-SECGOV-01, 03). Every audited change is one row. Each row holds
// the hash of the row before it for the same tenant, so a changed, inserted or removed row breaks the chain and verification
// shows where. Writes for a tenant are serialised by an advisory lock, so the chain has no forks.
import { createHash } from "node:crypto";
import type { PoolClient, Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { stableStringify } from "../db/idempotency";

export const GENESIS_HASH = "0".repeat(64);

/** Actions that must carry a reason code and a narrative (REQ-SECGOV-F04). Other actions may carry one. */
export const REASON_REQUIRED = new Set([
  "document.rejected", "document.returned", "document.cancelled", "document.reversed", "period.unlocked", "override.applied",
  "entry.back_dated", "master.merged", "permission.changed", "record.restored", "waiver.granted",
]);

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  changedFields?: string[];
  reasonCode?: string | null;
  reason?: string | null;
  impersonatedBy?: string | null;
  sessionId?: string | null;
  causationId?: string | null;
}

export interface AuditRow {
  seq: number;
  occurredAt: Date;
  actorRef: string;
  impersonatedBy: string | null;
  sessionId: string | null;
  correlationId: string;
  causationId: string | null;
  module: string;
  entityType: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changedFields: string[];
  reasonCode: string | null;
  reason: string | null;
  prevHash: string;
  hash: string;
}

/** The hash covers every stored field, in a fixed order, and the previous hash. Changing any byte changes the hash. */
export function rowHash(tenantId: string, r: Omit<AuditRow, "hash">): string {
  const body = stableStringify({
    tenant: tenantId,
    seq: r.seq,
    occurredAt: r.occurredAt.toISOString(),
    actor: r.actorRef,
    impersonatedBy: r.impersonatedBy,
    session: r.sessionId,
    correlation: r.correlationId,
    causation: r.causationId,
    module: r.module,
    entityType: r.entityType,
    entityId: r.entityId,
    action: r.action,
    before: r.before,
    after: r.after,
    changed: r.changedFields,
    reasonCode: r.reasonCode,
    reason: r.reason,
    prev: r.prevHash,
  });
  return createHash("sha256").update(body).digest("hex");
}

/** The module is the first segment of the action: "procurement.po.created" → "procurement". */
export function moduleOf(action: string): string {
  return action.split(".")[0];
}

/**
 * Appends one row to the tenant's chain. Must run inside the caller's transaction, so that the audited change and its audit row
 * commit together or not at all (CP-SECGOV-01). A reason-required action without a reason is refused.
 */
export async function writeAudit(client: PoolClient, ctx: RequestContext, entry: AuditEntry): Promise<{ seq: number; hash: string }> {
  if (REASON_REQUIRED.has(entry.action) && (!entry.reasonCode || !entry.reason || entry.reason.trim().length < 10)) {
    throw new AppError("VALIDATION_FAILED", `${entry.action} needs a reason code and a reason of at least 10 characters`, [{ field: "reason", message: "required" }]);
  }
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`audit-chain:${ctx.tenantId}`]);
  const last = await client.query<{ seq: string; hash: string }>("SELECT seq, hash FROM sec_audit_log WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1", [ctx.tenantId]);
  const seq = last.rowCount ? Number(last.rows[0].seq) + 1 : 1;
  const prevHash = last.rowCount ? last.rows[0].hash : GENESIS_HASH;
  const base: Omit<AuditRow, "hash"> = {
    seq,
    occurredAt: new Date(),
    actorRef: ctx.userId,
    impersonatedBy: entry.impersonatedBy ?? null,
    sessionId: entry.sessionId ?? null,
    correlationId: ctx.correlationId,
    causationId: entry.causationId ?? ctx.causationId,
    module: moduleOf(entry.action),
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    changedFields: entry.changedFields ?? [],
    reasonCode: entry.reasonCode ?? null,
    reason: entry.reason ?? null,
    prevHash,
  };
  const hash = rowHash(ctx.tenantId, base);
  await client.query(
    `INSERT INTO sec_audit_log (tenant_id, seq, occurred_at, actor_ref, impersonated_by, session_id, correlation_id, causation_id, module, entity_type, entity_id, action,
       before_json, after_json, changed_fields, reason_code, reason, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [ctx.tenantId, seq, base.occurredAt, base.actorRef, base.impersonatedBy, base.sessionId, base.correlationId, base.causationId, base.module,
      base.entityType, base.entityId, base.action, base.before === null ? null : JSON.stringify(base.before), base.after === null ? null : JSON.stringify(base.after),
      base.changedFields, base.reasonCode, base.reason, prevHash, hash],
  );
  return { seq, hash };
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  brokenAtSeq: number | null;
  reason: string | null;
}

/** Recomputes every hash for the tenant, in order. The first row that does not match is reported. */
export async function verifyChain(pool: Pool, ctx: RequestContext, batch = 1000): Promise<VerifyResult> {
  let checked = 0;
  let expectedPrev = GENESIS_HASH;
  let afterSeq = 0;
  for (;;) {
    const rows = await withTransaction(
      pool,
      async (client) => (await client.query<{ seq: string; occurred_at: Date; actor_ref: string; impersonated_by: string | null; session_id: string | null; correlation_id: string; causation_id: string | null; module: string; entity_type: string; entity_id: string; action: string; before_json: Record<string, unknown> | null; after_json: Record<string, unknown> | null; changed_fields: string[]; reason_code: string | null; reason: string | null; prev_hash: string; hash: string }>(
        "SELECT seq, occurred_at, actor_ref, impersonated_by, session_id, correlation_id, causation_id, module, entity_type, entity_id, action, before_json, after_json, changed_fields, reason_code, reason, prev_hash, hash FROM sec_audit_log WHERE tenant_id = $1 AND seq > $2 ORDER BY seq LIMIT $3",
        [ctx.tenantId, afterSeq, batch],
      )).rows,
      { tenantId: ctx.tenantId },
    );
    if (rows.length === 0) break;
    for (const r of rows) {
      checked += 1;
      const row: Omit<AuditRow, "hash"> = {
        seq: Number(r.seq), occurredAt: r.occurred_at, actorRef: r.actor_ref, impersonatedBy: r.impersonated_by, sessionId: r.session_id,
        correlationId: r.correlation_id, causationId: r.causation_id, module: r.module, entityType: r.entity_type, entityId: r.entity_id,
        action: r.action, before: r.before_json, after: r.after_json, changedFields: r.changed_fields, reasonCode: r.reason_code,
        reason: r.reason, prevHash: r.prev_hash,
      };
      if (r.prev_hash !== expectedPrev) return { ok: false, checked, brokenAtSeq: row.seq, reason: "the link to the previous row is broken" };
      if (rowHash(ctx.tenantId, row) !== r.hash) return { ok: false, checked, brokenAtSeq: row.seq, reason: "the row content does not match its hash" };
      expectedPrev = r.hash;
      afterSeq = row.seq;
    }
  }
  return { ok: true, checked, brokenAtSeq: null, reason: null };
}

/** The timeline of one record, newest first (REQ-SECGOV-F03). Row-level security applies. */
export async function recordTimeline(pool: Pool, ctx: RequestContext, entityType: string, entityId: string, limit = 200): Promise<AuditRow[]> {
  const { rows } = await withTransaction(
    pool,
    (client) => client.query<Record<string, unknown>>(
      "SELECT seq, occurred_at, actor_ref, impersonated_by, session_id, correlation_id, causation_id, module, entity_type, entity_id, action, before_json, after_json, changed_fields, reason_code, reason, prev_hash, hash FROM sec_audit_log WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3 ORDER BY seq DESC LIMIT $4",
      [ctx.tenantId, entityType, entityId, Math.min(limit, 1000)],
    ),
    { tenantId: ctx.tenantId },
  );
  return rows.map((r) => ({
    seq: Number(r.seq), occurredAt: r.occurred_at as Date, actorRef: String(r.actor_ref), impersonatedBy: (r.impersonated_by as string | null), sessionId: (r.session_id as string | null),
    correlationId: String(r.correlation_id), causationId: (r.causation_id as string | null), module: String(r.module), entityType: String(r.entity_type), entityId: String(r.entity_id),
    action: String(r.action), before: (r.before_json as Record<string, unknown> | null), after: (r.after_json as Record<string, unknown> | null),
    changedFields: (r.changed_fields as string[]), reasonCode: (r.reason_code as string | null), reason: (r.reason as string | null), prevHash: String(r.prev_hash), hash: String(r.hash),
  }));
}

/** Records that a flagged field was read (REQ-SECGOV-F05). Also written to the chain, so the read itself is evidence. */
export async function recordSensitiveRead(pool: Pool, ctx: RequestContext, input: { entityType: string; entityId: string; fields: string[]; reason?: string | null }): Promise<void> {
  if (input.fields.length === 0) throw new AppError("VALIDATION_FAILED", "name the fields that were read");
  await withTransaction(
    pool,
    async (client) => {
      await client.query(
        "INSERT INTO sec_sensitive_reads (tenant_id, actor_ref, entity_type, entity_id, fields, reason, correlation_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [ctx.tenantId, ctx.userId, input.entityType, input.entityId, input.fields, input.reason ?? null, ctx.correlationId],
      );
      await writeAudit(client, ctx, { action: "secgov.sensitive_read", entityType: input.entityType, entityId: input.entityId, after: { fields: input.fields } });
    },
    { tenantId: ctx.tenantId },
  );
}

/** Masks an account number for the audit trail: the last four digits and a short hash of the whole (policy in Part 08 §6). */
export function maskAccount(account: string): string {
  const digits = account.replace(/\s+/g, "");
  const tail = digits.slice(-4);
  return `${"*".repeat(Math.max(0, digits.length - 4))}${tail} #${createHash("sha256").update(digits).digest("hex").slice(0, 8)}`;
}
