// Joiner, mover, leaver (Part 07 slice S4; REQ-IAM-F18). Events come from HR (Part 54). Assignments created here are pending and
// need a second approver as usual. A leaver's access ends at once, and the settlement gate refuses until it has.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { can } from "./pdp";
import { proposeAssignment, type AssignmentInput } from "./roles";

async function requireRevoke(pool: Pool, ctx: RequestContext): Promise<void> {
  const allowed = await can(pool, ctx, "iam.access.revoke");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
}

/** Joiner: proposes the role template's assignments. Each one waits for a second approver. */
export async function joinerAssignments(pool: Pool, ctx: RequestContext, input: { userRef: string; assignments: AssignmentInput[] }): Promise<number[]> {
  const ids: number[] = [];
  for (const a of input.assignments) {
    const { id } = await proposeAssignment(pool, ctx, { ...a, userRef: input.userRef });
    ids.push(id);
  }
  return ids;
}

/** Mover: ends the person's assignments that no longer apply, from a date. New ones are proposed with `joinerAssignments`. */
export async function endAssignments(pool: Pool, ctx: RequestContext, input: { assignmentIds: number[]; endOn: string; reason: string }): Promise<number> {
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  await requireRevoke(pool, ctx);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const res = await uow.client.query(
      "UPDATE iam_user_role_assignments SET valid_to = GREATEST(valid_from, $3::date), revoked_at = now() WHERE tenant_id = $1 AND id = ANY($2::bigint[]) AND approval_status = 'approved' AND (valid_to IS NULL OR valid_to > $3::date)",
      [ctx.tenantId, input.assignmentIds, input.endOn],
    );
    await uow.audit({ action: "iam.assignment.ended", entityType: "assignment", entityId: input.assignmentIds.join(","), detail: { endOn: input.endOn, count: res.rowCount } });
    await uow.emit({ eventType: "iam.access.revoked", payload: { assignments: input.assignmentIds.length, endOn: input.endOn } });
    return res.rowCount ?? 0;
  });
}

/** Leaver: revokes the person's access at once: their approved assignments end today, their pending ones are rejected, and a
 *  revocation is recorded that the request pipeline and sign-in check. */
export async function leaver(pool: Pool, ctx: RequestContext, input: { userRef: string; reason: string }): Promise<{ endedAssignments: number; rejectedPending: number }> {
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  await requireRevoke(pool, ctx);
  return runUnitOfWork(pool, ctx, async (uow) => {
    await uow.client.query("INSERT INTO iam_revocations (tenant_id, user_ref, reason, revoked_by) VALUES ($1, $2, $3, $4)", [ctx.tenantId, input.userRef, input.reason, ctx.userId]);
    const ended = await uow.client.query(
      "UPDATE iam_user_role_assignments SET valid_to = GREATEST(valid_from, CURRENT_DATE), revoked_at = now() WHERE tenant_id = $1 AND user_ref = $2 AND approval_status = 'approved' AND (valid_to IS NULL OR valid_to > CURRENT_DATE)",
      [ctx.tenantId, input.userRef],
    );
    const rejected = await uow.client.query(
      "UPDATE iam_user_role_assignments SET approval_status = 'rejected' WHERE tenant_id = $1 AND user_ref = $2 AND approval_status = 'pending'",
      [ctx.tenantId, input.userRef],
    );
    await uow.audit({ action: "iam.access.revoked", entityType: "person", entityId: input.userRef, detail: { ended: ended.rowCount, rejected: rejected.rowCount } });
    await uow.ledger({ action: "CLOSED", entityType: "person", entityId: input.userRef, reason: input.reason });
    await uow.evaluate({ cpCode: "CP-IAM-07", result: "PASS", detail: { action: "leaver_revocation" } });
    await uow.emit({ eventType: "iam.access.revoked", payload: { userRef: input.userRef } });
    return { endedAssignments: ended.rowCount ?? 0, rejectedPending: rejected.rowCount ?? 0 };
  });
}

/** The settlement gate: final settlement of a leaver may be approved only once their access is revoked and nothing remains. */
export async function settlementGate(pool: Pool, ctx: RequestContext, userRef: string): Promise<{ allowed: boolean; reason: string }> {
  return withTransaction(
    pool,
    async (client) => {
      const revoked = await client.query("SELECT 1 FROM iam_revocations WHERE tenant_id = $1 AND user_ref = $2 AND cleared_at IS NULL", [ctx.tenantId, userRef]);
      if ((revoked.rowCount ?? 0) === 0) return { allowed: false, reason: "access is not revoked yet" };
      const live = await client.query(
        "SELECT 1 FROM iam_user_role_assignments WHERE tenant_id = $1 AND user_ref = $2 AND approval_status = 'approved' AND revoked_at IS NULL AND (valid_to IS NULL OR valid_to > CURRENT_DATE)",
        [ctx.tenantId, userRef],
      );
      if ((live.rowCount ?? 0) > 0) return { allowed: false, reason: "active assignments remain" };
      return { allowed: true, reason: "access revoked" };
    },
    { tenantId: ctx.tenantId },
  );
}
