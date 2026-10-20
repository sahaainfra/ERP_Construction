// Export controls (Part 07 slice S4; REQ-IAM-F20). Every export of a register or report is decided here: the permission, the
// row limit, a step-up above a threshold, and a watermark that names the person, the time and the request.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { can } from "./pdp";

export async function setExportRule(pool: Pool, ctx: RequestContext, input: { reportKey: string; permissionKey: string; maxRows: number; stepUpAboveRows: number }): Promise<void> {
  const allowed = await can(pool, ctx, "iam.export.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  if (!(input.maxRows > 0) || input.stepUpAboveRows < 0 || input.stepUpAboveRows > input.maxRows) throw new AppError("VALIDATION_FAILED", "the row limits are not consistent");
  await withTransaction(
    pool,
    (c) => c.query(
      `INSERT INTO iam_export_rules (tenant_id, report_key, permission_key, max_rows, step_up_above_rows, created_by) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, report_key) DO UPDATE SET permission_key = EXCLUDED.permission_key, max_rows = EXCLUDED.max_rows, step_up_above_rows = EXCLUDED.step_up_above_rows`,
      [ctx.tenantId, input.reportKey, input.permissionKey, input.maxRows, input.stepUpAboveRows, ctx.userId],
    ),
    { tenantId: ctx.tenantId },
  );
}

export interface ExportDecision {
  decision: "allowed" | "denied" | "step_up_required";
  reason: string;
  watermark: string | null;
}

/** Decides an export. Unknown reports are denied. A step-up is needed above the threshold; the caller verifies it (S1). */
export async function authorizeExport(pool: Pool, ctx: RequestContext, input: { reportKey: string; rowCount: number; stepUpVerified: boolean; now?: Date }): Promise<ExportDecision> {
  const now = input.now ?? new Date();
  const rule = await withTransaction(
    pool,
    async (client) => (await client.query<{ permission_key: string; max_rows: number; step_up_above_rows: number }>(
      "SELECT permission_key, max_rows, step_up_above_rows FROM iam_export_rules WHERE tenant_id = $1 AND report_key = $2", [ctx.tenantId, input.reportKey])).rows[0],
    { tenantId: ctx.tenantId },
  );
  let outcome: ExportDecision;
  if (!rule) outcome = { decision: "denied", reason: "no export rule exists for this report", watermark: null };
  else if (!(await can(pool, ctx, rule.permission_key)).allowed) outcome = { decision: "denied", reason: `missing ${rule.permission_key}`, watermark: null };
  else if (input.rowCount > rule.max_rows) outcome = { decision: "denied", reason: `more than ${rule.max_rows} rows; narrow the filter`, watermark: null };
  else if (input.rowCount > rule.step_up_above_rows && !input.stepUpVerified) outcome = { decision: "step_up_required", reason: `above ${rule.step_up_above_rows} rows needs a fresh verification`, watermark: null };
  else outcome = { decision: "allowed", reason: "allowed", watermark: `${ctx.userId} · ${now.toISOString()} · ${ctx.correlationId}` };
  await runUnitOfWork(pool, ctx, async (uow) => {
    await uow.client.query(
      "INSERT INTO iam_export_events (tenant_id, user_ref, report_key, row_count, step_up_verified, decision, watermark, correlation_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [ctx.tenantId, ctx.userId, input.reportKey, input.rowCount, input.stepUpVerified, outcome.decision, outcome.watermark, ctx.correlationId],
    );
    await uow.audit({ action: "iam.export.decided", entityType: "report", entityId: input.reportKey, detail: { decision: outcome.decision, rows: input.rowCount } });
  });
  return outcome;
}
