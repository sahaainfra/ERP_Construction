// Authority limits (Part 07 REQ-IAM-F10). The most a person may approve by document type, project and category. Consumed by
// approval routing (Part 16). Among limits that apply, the most specific wins; within one level the lowest limit applies.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";

export interface LimitInput {
  userRef: string;
  docType: string;
  projectId?: number | null;
  category?: string | null;
  maxAmountPaise: number;
  validFrom: string;
  validTo?: string | null;
  reason: string;
}

/** Creates a limit pending approval. The approver must be someone else (CP-IAM-01). */
export async function proposeLimit(pool: Pool, ctx: RequestContext, input: LimitInput): Promise<{ id: number }> {
  if (!Number.isInteger(input.maxAmountPaise) || input.maxAmountPaise < 0) throw new AppError("VALIDATION_FAILED", "the limit must be a whole number of paise, 0 or more", [{ field: "maxAmountPaise", message: "invalid" }]);
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short", [{ field: "reason", message: "at least 10 characters" }]);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const { rows } = await uow.client.query<{ id: string }>(
      `INSERT INTO iam_authority_limits (tenant_id, user_ref, doc_type, project_id, category, max_amount_paise, valid_from, valid_to, created_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [ctx.tenantId, input.userRef, input.docType, input.projectId ?? null, input.category ?? null, input.maxAmountPaise, input.validFrom, input.validTo ?? null, ctx.userId, input.reason],
    );
    const id = Number(rows[0].id);
    await uow.audit({ action: "iam.authority_limit.proposed", entityType: "authority_limit", entityId: String(id), detail: { docType: input.docType, maxAmountPaise: input.maxAmountPaise } });
    await uow.ledger({ action: "CREATED", entityType: "authority_limit", entityId: String(id), reason: input.reason });
    return { id };
  });
}

export async function approveLimit(pool: Pool, ctx: RequestContext, id: number, reason: string): Promise<void> {
  if (reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ created_by: string; approval_status: string }>("SELECT created_by, approval_status FROM iam_authority_limits WHERE id = $1 FOR UPDATE", [id]);
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the limit was not found");
    if (found.rows[0].created_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the creator cannot approve their own limit");
    if (found.rows[0].approval_status !== "pending") throw new AppError("CONFLICT", "the limit has already been decided");
    await uow.client.query("UPDATE iam_authority_limits SET approval_status = 'approved', approved_by = $2 WHERE id = $1", [id, ctx.userId]);
    await uow.audit({ action: "iam.authority_limit.approved", entityType: "authority_limit", entityId: String(id), detail: { reason } });
    await uow.evaluate({ cpCode: "CP-IAM-01", result: "PASS", detail: { action: "approve_limit" } });
  });
}

/** The limit that applies to an approval, or null when the person has none for that document type. */
export async function limitFor(pool: Pool, ctx: RequestContext, input: { userRef: string; docType: string; projectId?: number | null; category?: string | null; at: string }): Promise<number | null> {
  const { rows } = await withTransaction(
    pool,
    (client) =>
      client.query<{ max_amount_paise: string; project_id: string | null; category: string | null }>(
        `SELECT max_amount_paise, project_id, category FROM iam_authority_limits
          WHERE tenant_id = $1 AND user_ref = $2 AND doc_type = $3 AND approval_status = 'approved'
            AND valid_from <= $4::date AND (valid_to IS NULL OR valid_to >= $4::date)
            AND (project_id IS NULL OR project_id = $5) AND (category IS NULL OR category = $6)`,
        [ctx.tenantId, input.userRef, input.docType, input.at, input.projectId ?? null, input.category ?? null],
      ),
    { tenantId: ctx.tenantId },
  );
  if (rows.length === 0) return null;
  const specificity = (r: (typeof rows)[number]) => (r.project_id !== null ? 1 : 0) + (r.category !== null ? 1 : 0);
  const top = Math.max(...rows.map(specificity));
  return Math.min(...rows.filter((r) => specificity(r) === top).map((r) => Number(r.max_amount_paise)));
}

/** Whether a person may approve an amount for a document type. Refuses when there is no limit or the amount is above it. */
export async function mayApprove(pool: Pool, ctx: RequestContext, input: { userRef: string; docType: string; projectId?: number | null; category?: string | null; amountPaise: number; at: string }): Promise<{ allowed: boolean; limitPaise: number | null }> {
  const limit = await limitFor(pool, ctx, input);
  return { allowed: limit !== null && input.amountPaise <= limit, limitPaise: limit };
}
