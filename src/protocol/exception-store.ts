// Exception requests, approval, consumption, emergency path and configuration (Part 17 REQ-PROTOCOL-F05 to F09; CP-PROTOCOL-03, CP-PROTOCOL-04;
// A-166, A-170, A-171). Approval is by a person holding the band's role, never by the requester. Consumption happens inside the transaction
// that uses the exception, and a cap is enforced there, so a second use is refused.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { writeAudit } from "../secgov/audit";
import {
  consumable, EXCEPTION_TYPES, matrixBand, narrativeProblem, type Band, type ThresholdRow, type Validity, thresholdAt, emergencyDue,
} from "./exceptions";

/** Role codes a band's approval needs (A-171): the role codes are assumptions until Part 07 confirms them. */
export const BAND_ROLES: Record<Band, string[]> = { PM: ["project_manager"], PM_COST: ["project_manager", "cost_controller"], MANAGEMENT: ["management"] };

export async function holdsAnyRole(client: PoolClient, tenantId: string, userRef: string, roleCodes: string[]): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM iam_user_role_assignments a JOIN iam_roles r ON r.id = a.role_id
      WHERE a.tenant_id = $1 AND a.user_ref = $2 AND r.role_code = ANY($3::text[]) AND a.approval_status = 'approved'
        AND a.valid_from <= CURRENT_DATE AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)`,
    [tenantId, userRef, roleCodes],
  );
  return (rowCount ?? 0) > 0;
}

export interface RequestInput {
  exceptionType: string;
  cpCode?: string;
  reference: string;
  requestedValue: number;
  unit: string;
  variancePct?: number;
  amountPaise?: number;
  reasonCode: string;
  narrative: string;
  validity: Validity;
  validUntil?: string;
}

export async function requestException(pool: Pool, ctx: RequestContext, input: RequestInput): Promise<{ id: number; band: Band }> {
  if (!(EXCEPTION_TYPES as readonly string[]).includes(input.exceptionType)) throw new AppError("VALIDATION_FAILED", "the exception type is not in the catalogue", [{ field: "exceptionType", message: "unknown" }]);
  const problem = narrativeProblem(input.reasonCode, input.narrative);
  if (problem) throw new AppError("VALIDATION_FAILED", problem, [{ field: "narrative", message: "too short" }]);
  if (input.variancePct === undefined || input.amountPaise === undefined) throw new AppError("VALIDATION_FAILED", "the variance and the amount are needed to route the exception");
  if (input.validity === "UNTIL_DATE" && !input.validUntil) throw new AppError("VALIDATION_FAILED", "an until-date exception needs its end date", [{ field: "validUntil", message: "required" }]);
  const band = matrixBand(input.variancePct, input.amountPaise);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const inserted = await uow.client.query<{ id: string }>(
      `INSERT INTO protocol_exceptions (tenant_id, exception_type, cp_code, reference, requested_by, requested_value, unit, variance_pct, amount_paise,
                                        reason_code, narrative, validity_kind, valid_until, approval_band, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'IN_APPROVAL') RETURNING id`,
      [ctx.tenantId, input.exceptionType, input.cpCode ?? null, input.reference, ctx.userId, input.requestedValue, input.unit, input.variancePct, input.amountPaise, input.reasonCode, input.narrative, input.validity, input.validUntil ?? null, band],
    );
    const id = Number(inserted.rows[0].id);
    await writeAudit(uow.client, ctx, { action: "protocol.exception.requested", entityType: "exception", entityId: String(id), after: { band, type: input.exceptionType }, reasonCode: input.reasonCode, reason: input.narrative });
    await uow.emit({ eventType: "protocol.exception.requested", payload: { exceptionId: id, band }, aggregateKey: input.reference });
    return { id, band };
  });
}

/** Approves an exception with its cap. The approver must hold the band's role and must not be the requester. */
export async function approveException(pool: Pool, ctx: RequestContext, input: { id: number; cap: number }): Promise<void> {
  if (!(input.cap >= 0)) throw new AppError("VALIDATION_FAILED", "the cap must be zero or more");
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ requested_by: string; approval_band: Band; status: string; reference: string }>(
      "SELECT requested_by, approval_band, status, reference FROM protocol_exceptions WHERE tenant_id = $1 AND id = $2 FOR UPDATE", [ctx.tenantId, input.id],
    );
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the exception was not found");
    const row = found.rows[0];
    if (row.status !== "IN_APPROVAL") throw new AppError("CONFLICT", "only an exception awaiting approval can be approved");
    if (row.requested_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the requester cannot approve their own exception");
    if (!(await holdsAnyRole(uow.client, ctx.tenantId, ctx.userId, BAND_ROLES[row.approval_band]))) throw new AppError("FORBIDDEN", "the approver does not hold the role this exception needs");
    await uow.client.query("UPDATE protocol_exceptions SET status = 'APPROVED', approved_cap = $3, approved_by = $4, approved_at = now() WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, input.id, input.cap, ctx.userId]);
    await writeAudit(uow.client, ctx, { action: "protocol.exception.approved", entityType: "exception", entityId: String(input.id), after: { cap: input.cap } });
    await uow.emit({ eventType: "protocol.exception.approved", payload: { exceptionId: input.id }, aggregateKey: row.reference });
  });
}

/** Uses an approved exception inside the caller's transaction. Refused when it is spent, expired or would exceed the cap. */
export async function consumeException(client: PoolClient, ctx: RequestContext, input: { id: number; quantity: number; transactionRef: string }): Promise<void> {
  const found = await client.query<{ status: string; validity_kind: Validity; approved_cap: string | null; consumed_total: string; valid_until: Date | null; reference: string }>(
    "SELECT status, validity_kind, approved_cap, consumed_total, valid_until, reference FROM protocol_exceptions WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
    [ctx.tenantId, input.id],
  );
  if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the exception was not found");
  const row = found.rows[0];
  const today = new Date().toISOString().slice(0, 10);
  const verdict = consumable(
    { status: row.status, validity: row.validity_kind, cap: row.approved_cap === null ? null : Number(row.approved_cap), consumed: Number(row.consumed_total), validUntil: row.valid_until ? row.valid_until.toISOString().slice(0, 10) : null },
    input.quantity,
    today,
  );
  if (!verdict.ok) throw new AppError("VALIDATION_FAILED", `the exception cannot be used: ${verdict.reason}`);
  await client.query("UPDATE protocol_exceptions SET consumed_total = $3, status = $4 WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, input.id, verdict.consumed, verdict.status]);
  await client.query("INSERT INTO protocol_exception_consumptions (tenant_id, exception_id, quantity, consumed_by, transaction_ref) VALUES ($1, $2, $3, $4, $5)", [ctx.tenantId, input.id, input.quantity, ctx.userId, input.transactionRef]);
  await writeAudit(client, ctx, { action: "protocol.exception.consumed", entityType: "exception", entityId: String(input.id), after: { quantity: input.quantity, transactionRef: input.transactionRef } });
}

/** Emergency execution: performed now, with a photo and a GPS position, regularised inside the window (A-161). */
export async function startEmergency(pool: Pool, ctx: RequestContext, input: { reference: string; reasonCode: string; narrative: string; evidence: { photoRef?: string; gps?: { lat: number; lng: number } } }): Promise<{ id: number; dueAt: string }> {
  if (!input.evidence.photoRef || !input.evidence.gps) throw new AppError("VALIDATION_FAILED", "an emergency needs a photo and a GPS position", [{ field: "evidence", message: "required" }]);
  const problem = narrativeProblem(input.reasonCode, input.narrative);
  if (problem) throw new AppError("VALIDATION_FAILED", problem);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const now = new Date();
    const due = emergencyDue(now);
    const inserted = await uow.client.query<{ id: string }>(
      `INSERT INTO protocol_exceptions (tenant_id, exception_type, reference, requested_by, requested_value, unit, reason_code, narrative, validity_kind,
                                        status, emergency, emergency_due_at, evidence)
       VALUES ($1, 'EMERGENCY_PURCHASE', $2, $3, 0, 'event', $4, $5, 'SINGLE_USE', 'EMERGENCY', true, $6, $7) RETURNING id`,
      [ctx.tenantId, input.reference, ctx.userId, input.reasonCode, input.narrative, due.toISOString(), JSON.stringify(input.evidence)],
    );
    const id = Number(inserted.rows[0].id);
    await writeAudit(uow.client, ctx, { action: "protocol.emergency.started", entityType: "exception", entityId: String(id), after: { dueAt: due.toISOString() }, reasonCode: input.reasonCode, reason: input.narrative });
    await uow.emit({ eventType: "protocol.exception.requested", payload: { exceptionId: id, emergency: true }, aggregateKey: input.reference });
    return { id, dueAt: due.toISOString() };
  });
}

/** Regularises an emergency: approve or reject it. The requester cannot regularise their own. */
export async function regulariseEmergency(pool: Pool, ctx: RequestContext, input: { id: number; decision: "approve" | "reject"; note: string }): Promise<void> {
  if (input.note.trim().length < 20) throw new AppError("VALIDATION_FAILED", "the regularisation note needs at least 20 characters");
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ requested_by: string; status: string; emergency_due_at: Date; regularised_at: Date | null; reference: string }>(
      "SELECT requested_by, status, emergency_due_at, regularised_at, reference FROM protocol_exceptions WHERE tenant_id = $1 AND id = $2 AND emergency FOR UPDATE",
      [ctx.tenantId, input.id],
    );
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the emergency was not found");
    const row = found.rows[0];
    if (row.status !== "EMERGENCY" || row.regularised_at) throw new AppError("CONFLICT", "this emergency is already regularised");
    if (row.requested_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the requester cannot regularise their own emergency");
    if (!(await holdsAnyRole(uow.client, ctx.tenantId, ctx.userId, ["project_manager", "management"]))) throw new AppError("FORBIDDEN", "only a project manager or management can regularise an emergency");
    const status = input.decision === "approve" ? "APPROVED" : "REJECTED";
    await uow.client.query(
      "UPDATE protocol_exceptions SET status = $3, regularised_at = now(), regularised_by = $4, approved_by = CASE WHEN $3 = 'APPROVED' THEN $4 ELSE approved_by END WHERE tenant_id = $1 AND id = $2",
      [ctx.tenantId, input.id, status, ctx.userId],
    );
    await writeAudit(uow.client, ctx, { action: "protocol.emergency.regularised", entityType: "exception", entityId: String(input.id), after: { status }, reason: input.note });
    await uow.emit({ eventType: "protocol.exception.approved", payload: { exceptionId: input.id, emergency: true, status }, aggregateKey: row.reference });
    await uow.evaluate({ cpCode: "CP-PROTOCOL-04", result: "PASS", detail: { exceptionId: input.id, status } });
  });
}

/** Emergencies not regularised by their deadline. Escalated to L3 by Part 18 (CP-PROTOCOL-04). */
export async function overdueEmergencies(pool: Pool, ctx: RequestContext, asOf: Date = new Date()): Promise<{ id: number; dueAt: string }[]> {
  const { rows } = await withTransaction(
    pool,
    (client) => client.query<{ id: string; emergency_due_at: Date }>(
      "SELECT id, emergency_due_at FROM protocol_exceptions WHERE tenant_id = $1 AND emergency AND status = 'EMERGENCY' AND regularised_at IS NULL AND emergency_due_at < $2::timestamptz ORDER BY emergency_due_at",
      [ctx.tenantId, asOf.toISOString()],
    ),
    { tenantId: ctx.tenantId },
  );
  return rows.map((r) => ({ id: Number(r.id), dueAt: r.emergency_due_at.toISOString() }));
}

// ---- configuration (versioned, maker-checker) ----

export type ConfigKind = "THRESHOLD" | "EVIDENCE_RULE" | "REASON_CODE" | "EXCEPTION_MATRIX";

/** Each kind's body is checked before it is stored. A threshold carries its scope; every body carries its scope key for the active index. */
export function configBody(kind: ConfigKind, body: Record<string, unknown>): Record<string, unknown> {
  if (kind === "THRESHOLD") {
    if (!["COMPANY", "PROJECT_TYPE", "PROJECT", "MATERIAL_GROUP"].includes(String(body.scopeType))) throw new AppError("VALIDATION_FAILED", "the threshold scope is not valid");
    if (typeof body.scopeId !== "string" || typeof body.value !== "number") throw new AppError("VALIDATION_FAILED", "a threshold needs a scope id and a numeric value");
    if (typeof body.effectiveFrom !== "string") throw new AppError("VALIDATION_FAILED", "a threshold needs an effective-from date");
    return { ...body, scopeKey: `${body.scopeType}|${body.scopeId}` };
  }
  if (kind === "EVIDENCE_RULE") {
    if (!["photo", "document", "field", "signature", "gps"].includes(String(body.itemType)) || !Number.isInteger(body.minCount) || (body.minCount as number) < 0) {
      throw new AppError("VALIDATION_FAILED", "an evidence rule needs an item type and a whole minimum count");
    }
    return { ...body, scopeKey: String(body.itemType) };
  }
  if (kind === "REASON_CODE") {
    if (typeof body.label !== "string" || typeof body.module !== "string") throw new AppError("VALIDATION_FAILED", "a reason code needs a module and a label");
    return { ...body, scopeKey: String(body.module) };
  }
  if (!["PM", "PM_COST", "MANAGEMENT"].includes(String(body.band))) throw new AppError("VALIDATION_FAILED", "a matrix row needs an approval band");
  return { ...body, scopeKey: String(body.band) };
}

export async function proposeConfig(pool: Pool, ctx: RequestContext, input: { kind: ConfigKind; itemKey: string; body: Record<string, unknown> }): Promise<{ version: number }> {
  const body = configBody(input.kind, input.body);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const { rows } = await uow.client.query<{ version: number }>("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM protocol_config_items WHERE tenant_id = $1 AND kind = $2 AND item_key = $3", [ctx.tenantId, input.kind, input.itemKey]);
    const version = Number(rows[0].version);
    await uow.client.query("INSERT INTO protocol_config_items (tenant_id, kind, item_key, version, status, body, created_by) VALUES ($1, $2, $3, $4, 'draft', $5, $6)", [ctx.tenantId, input.kind, input.itemKey, version, JSON.stringify(body), ctx.userId]);
    await writeAudit(uow.client, ctx, { action: "protocol.config.proposed", entityType: "protocol_config", entityId: `${input.kind}:${input.itemKey}@${version}` });
    return { version };
  });
}

/** Activates a draft. The author cannot. The active version with the same key and scope is retired (CP-PROTOCOL-03). */
export async function activateConfig(pool: Pool, ctx: RequestContext, input: { kind: ConfigKind; itemKey: string; version: number }): Promise<void> {
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ created_by: string; status: string; body: { scopeKey: string } }>(
      "SELECT created_by, status, body FROM protocol_config_items WHERE tenant_id = $1 AND kind = $2 AND item_key = $3 AND version = $4 FOR UPDATE",
      [ctx.tenantId, input.kind, input.itemKey, input.version],
    );
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the configuration version was not found");
    const row = found.rows[0];
    if (row.status !== "draft") throw new AppError("CONFLICT", "only a draft version can be activated");
    if (row.created_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the author cannot activate their own configuration (CP-PROTOCOL-03)");
    await uow.client.query(
      "UPDATE protocol_config_items SET status = 'retired' WHERE tenant_id = $1 AND kind = $2 AND item_key = $3 AND status = 'active' AND body->>'scopeKey' = $4",
      [ctx.tenantId, input.kind, input.itemKey, row.body.scopeKey],
    );
    await uow.client.query("UPDATE protocol_config_items SET status = 'active', activated_by = $5, activated_at = now() WHERE tenant_id = $1 AND kind = $2 AND item_key = $3 AND version = $4", [ctx.tenantId, input.kind, input.itemKey, input.version, ctx.userId]);
    await writeAudit(uow.client, ctx, { action: "protocol.config.activated", entityType: "protocol_config", entityId: `${input.kind}:${input.itemKey}@${input.version}` });
    await uow.evaluate({ cpCode: "CP-PROTOCOL-03", result: "PASS", detail: { action: "activate_config", kind: input.kind, itemKey: input.itemKey, version: input.version } });
  });
}

/** The active threshold for a key on a date and scope. Null when none is active: no value is ever assumed. */
export async function thresholdFor(client: PoolClient, ctx: RequestContext, key: string, date: string, scope: { companyId: string; projectTypeId?: string; projectId?: string; materialGroupId?: string }): Promise<number | null> {
  const { rows } = await client.query<{ body: { scopeType: ThresholdRow["scopeType"]; scopeId: string; value: number; effectiveFrom: string; effectiveTo?: string | null } }>(
    "SELECT body FROM protocol_config_items WHERE tenant_id = $1 AND kind = 'THRESHOLD' AND item_key = $2 AND status = 'active'",
    [ctx.tenantId, key],
  );
  const list: ThresholdRow[] = rows.map((r) => ({ key, scopeType: r.body.scopeType, scopeId: r.body.scopeId, value: r.body.value, effectiveFrom: r.body.effectiveFrom, effectiveTo: r.body.effectiveTo ?? null }));
  return thresholdAt(list, key, date, scope);
}
