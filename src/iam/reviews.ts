// Access certification (Part 07 slice S4; REQ-IAM-F19; CP-IAM-06). A campaign lists every approved assignment in a scope. Each
// reviewer keeps or revokes; nobody reviews their own access. A campaign closes only at 100 % decisions. Grants nobody decided on
// expire after the grace period and are revoked.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { can } from "./pdp";
import { sameActor } from "./actors";

export async function openReview(pool: Pool, ctx: RequestContext, input: { scopeType: "company" | "project"; scopeId: string; dueOn: string; graceDays?: number; reviewerRef: string }): Promise<{ id: number; items: number }> {
  const allowed = await can(pool, ctx, "iam.access.review");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) throw new AppError("VALIDATION_FAILED", "the due date must be YYYY-MM-DD", [{ field: "dueOn", message: "format" }]);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const { rows } = await uow.client.query<{ id: string }>(
      "INSERT INTO iam_access_reviews (tenant_id, scope_type, scope_id, due_on, grace_days, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [ctx.tenantId, input.scopeType, input.scopeId, input.dueOn, input.graceDays ?? 14, ctx.userId],
    );
    const reviewId = Number(rows[0].id);
    const items = await uow.client.query(
      `INSERT INTO iam_access_review_items (tenant_id, review_id, assignment_id, user_ref, reviewer_ref)
       SELECT tenant_id, $2, id, user_ref, $3 FROM iam_user_role_assignments
        WHERE tenant_id = $1 AND (scope_type = 'tenant' OR (scope_type = $4 AND scope_id = $5)) AND approval_status = 'approved'
          AND revoked_at IS NULL AND (valid_to IS NULL OR valid_to >= CURRENT_DATE) AND user_ref <> $3`,
      [ctx.tenantId, reviewId, input.reviewerRef, input.scopeType, input.scopeId],
    );
    await uow.audit({ action: "iam.access_review.opened", entityType: "access_review", entityId: String(reviewId), detail: { items: items.rowCount } });
    return { id: reviewId, items: items.rowCount ?? 0 };
  });
}

/** The reviewer keeps or revokes one grant. Revoking ends the assignment at once. A reviewer cannot decide their own access. */
export async function decideItem(pool: Pool, ctx: RequestContext, itemId: number, decision: "keep" | "revoke", reason: string): Promise<void> {
  if (reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ reviewer_ref: string; user_ref: string; decision: string; assignment_id: string; review_status: string }>(
      `SELECT i.reviewer_ref, i.user_ref, i.decision, i.assignment_id, r.status AS review_status
         FROM iam_access_review_items i JOIN iam_access_reviews r ON r.id = i.review_id WHERE i.id = $1 FOR UPDATE OF i`,
      [itemId],
    );
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the review item was not found");
    const item = found.rows[0];
    if (item.review_status !== "open") throw new AppError("CONFLICT", "the campaign is closed");
    if (item.reviewer_ref !== ctx.userId) throw new AppError("FORBIDDEN", "only the assigned reviewer can decide this item");
    if (await sameActor(uow.client, ctx.tenantId, item.user_ref, ctx.userId)) throw new AppError("MAKER_CHECKER_REQUIRED", "nobody reviews their own access");
    if (item.decision !== "pending") throw new AppError("CONFLICT", "this item has already been decided");
    await uow.client.query("UPDATE iam_access_review_items SET decision = $2, decided_by = $3, decided_at = now(), reason = $4 WHERE id = $1", [itemId, decision, ctx.userId, reason]);
    if (decision === "revoke") {
      await uow.client.query("UPDATE iam_user_role_assignments SET valid_to = GREATEST(valid_from, CURRENT_DATE), revoked_at = now() WHERE id = $1 AND (valid_to IS NULL OR valid_to > CURRENT_DATE)", [item.assignment_id]);
    }
    await uow.audit({ action: "iam.access_review.decided", entityType: "access_review_item", entityId: String(itemId), detail: { decision } });
  });
}

/** After the due date plus grace, every undecided grant expires: it is revoked and recorded as such. */
export async function expireUnreviewed(pool: Pool, ctx: RequestContext, reviewId: number, asOf: Date = new Date()): Promise<number> {
  const allowed = await can(pool, ctx, "iam.access.review");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const review = await uow.client.query<{ due_on: string; grace_days: number; status: string }>("SELECT to_char(due_on, 'YYYY-MM-DD') AS due_on, grace_days, status FROM iam_access_reviews WHERE id = $1 FOR UPDATE", [reviewId]);
    if (review.rowCount === 0) throw new AppError("NOT_FOUND", "the campaign was not found");
    if (review.rows[0].status !== "open") throw new AppError("CONFLICT", "the campaign is closed");
    const deadline = new Date(`${review.rows[0].due_on}T00:00:00Z`);
    deadline.setUTCDate(deadline.getUTCDate() + review.rows[0].grace_days);
    if (asOf <= deadline) throw new AppError("CONFLICT", "the grace period has not ended");
    const pending = await uow.client.query<{ id: string; assignment_id: string }>("SELECT id, assignment_id FROM iam_access_review_items WHERE review_id = $1 AND decision = 'pending'", [reviewId]);
    for (const p of pending.rows) {
      await uow.client.query("UPDATE iam_access_review_items SET decision = 'expired_revoked', decided_by = $2, decided_at = now(), reason = 'not reviewed before the deadline' WHERE id = $1", [p.id, ctx.userId]);
      await uow.client.query("UPDATE iam_user_role_assignments SET valid_to = GREATEST(valid_from, CURRENT_DATE), revoked_at = now() WHERE id = $1 AND (valid_to IS NULL OR valid_to > CURRENT_DATE)", [p.assignment_id]);
    }
    await uow.audit({ action: "iam.access_review.expired", entityType: "access_review", entityId: String(reviewId), detail: { expired: pending.rowCount } });
    return pending.rowCount ?? 0;
  });
}

/** Closes a campaign only when every item is decided (CP-IAM-06). */
export async function closeReview(pool: Pool, ctx: RequestContext, reviewId: number): Promise<void> {
  const allowed = await can(pool, ctx, "iam.access.review");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  const blockedBy = await runUnitOfWork(pool, ctx, async (uow) => {
    const review = await uow.client.query<{ status: string }>("SELECT status FROM iam_access_reviews WHERE id = $1 FOR UPDATE", [reviewId]);
    if (review.rowCount === 0) throw new AppError("NOT_FOUND", "the campaign was not found");
    if (review.rows[0].status !== "open") throw new AppError("CONFLICT", "the campaign is already closed");
    const pending = await uow.client.query<{ n: string }>("SELECT count(*) AS n FROM iam_access_review_items WHERE review_id = $1 AND decision = 'pending'", [reviewId]);
    if (Number(pending.rows[0].n) > 0) {
      await uow.evaluate({ cpCode: "CP-IAM-06", result: "BLOCK", detail: { pending: Number(pending.rows[0].n) } });
      return Number(pending.rows[0].n);
    }
    await uow.client.query("UPDATE iam_access_reviews SET status = 'closed', closed_by = $2 WHERE id = $1", [reviewId, ctx.userId]);
    await uow.evaluate({ cpCode: "CP-IAM-06", result: "PASS", detail: { reviewId } });
    await uow.audit({ action: "iam.access_review.closed", entityType: "access_review", entityId: String(reviewId), detail: {} });
    return 0;
  });
  if (blockedBy > 0) throw new AppError("PROTOCOL_BLOCKED", `${blockedBy} grant(s) still need a decision`);
}

export async function pendingCount(pool: Pool, ctx: RequestContext, reviewId: number): Promise<number> {
  return withTransaction(
    pool,
    async (client) => Number((await client.query<{ n: string }>("SELECT count(*) AS n FROM iam_access_review_items WHERE review_id = $1 AND decision = 'pending'", [reviewId])).rows[0].n),
    { tenantId: ctx.tenantId },
  );
}
