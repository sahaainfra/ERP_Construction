// Privileged access (Part 07 slice S4; REQ-IAM-F17; CP-IAM-04). No one holds a privileged permission all the time. A person asks
// for it for up to four hours with a reason; a second person approves; it ends on its own. A sensitive action still needs
// step-up (checked by the caller, from the MFA service in S1).
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { can } from "./pdp";
import type { Resource } from "./policy";

const MAX_HOURS = 4;

async function privilegedKey(pool: Pool, key: string): Promise<void> {
  const { rows } = await pool.query<{ sensitivity: string }>("SELECT sensitivity FROM iam_permissions WHERE permission_key = $1", [key]);
  if (rows.length === 0) throw new AppError("VALIDATION_FAILED", "the permission is not registered", [{ field: "permissionKey", message: "unknown" }]);
  if (rows[0].sensitivity !== "privileged") throw new AppError("VALIDATION_FAILED", "only privileged permissions can be elevated", [{ field: "permissionKey", message: "not privileged" }]);
}

export async function requestElevation(pool: Pool, ctx: RequestContext, input: { permissionKey: string; reason: string; hours: number }): Promise<{ id: number }> {
  if (input.reason.trim().length < 20) throw new AppError("VALIDATION_FAILED", "the reason needs at least 20 characters", [{ field: "reason", message: "too short" }]);
  if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > MAX_HOURS) throw new AppError("VALIDATION_FAILED", `the elevation lasts 1 to ${MAX_HOURS} hours`, [{ field: "hours", message: "out of range" }]);
  await privilegedKey(pool, input.permissionKey);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const { rows } = await uow.client.query<{ id: string }>(
      "INSERT INTO iam_elevations (tenant_id, user_ref, permission_key, reason, requested_hours, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [ctx.tenantId, ctx.userId, input.permissionKey, input.reason, input.hours, ctx.userId],
    );
    await uow.audit({ action: "iam.elevation.requested", entityType: "elevation", entityId: rows[0].id, detail: { permissionKey: input.permissionKey, hours: input.hours } });
    return { id: Number(rows[0].id) };
  });
}

/** A second person approves. The approver must hold `iam.elevation.approve`, and must not be the requester. The window starts now. */
export async function approveElevation(pool: Pool, ctx: RequestContext, id: number): Promise<{ expiresAt: Date }> {
  const allowed = await can(pool, ctx, "iam.elevation.approve");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ user_ref: string; state: string; requested_hours: number; created_by: string }>("SELECT user_ref, state, requested_hours, created_by FROM iam_elevations WHERE id = $1 FOR UPDATE", [id]);
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the request was not found");
    if (found.rows[0].created_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the requester cannot approve their own elevation");
    if (found.rows[0].state !== "requested") throw new AppError("CONFLICT", "the request has already been decided");
    const expires = new Date(Date.now() + found.rows[0].requested_hours * 3_600_000);
    await uow.client.query("UPDATE iam_elevations SET state = 'approved', approved_by = $2, approved_at = now(), expires_at = $3 WHERE id = $1", [id, ctx.userId, expires]);
    await uow.audit({ action: "iam.elevation.approved", entityType: "elevation", entityId: String(id), detail: { userRef: found.rows[0].user_ref } });
    await uow.evaluate({ cpCode: "CP-IAM-04", result: "PASS", detail: { action: "elevation_approved" } });
    await uow.emit({ eventType: "iam.privileged.elevated", payload: { id, userRef: found.rows[0].user_ref } });
    return { expiresAt: expires };
  });
}

/** Ends an elevation early. The holder or an approver may end it. */
export async function endElevation(pool: Pool, ctx: RequestContext, id: number): Promise<void> {
  await runUnitOfWork(pool, ctx, async (uow) => {
    const res = await uow.client.query("UPDATE iam_elevations SET state = 'ended', ended_at = now() WHERE id = $1 AND state = 'approved' AND (user_ref = $2 OR approved_by = $2)", [id, ctx.userId]);
    if ((res.rowCount ?? 0) === 0) throw new AppError("CONFLICT", "there is no active elevation of yours to end");
    await uow.audit({ action: "iam.elevation.ended", entityType: "elevation", entityId: String(id), detail: {} });
  });
}

/** Whether the person holds an approved, unexpired elevation for this permission right now. */
export async function isElevated(pool: Pool, ctx: RequestContext, permissionKey: string, at: Date = new Date()): Promise<boolean> {
  return withTransaction(
    pool,
    async (client) => {
      const { rowCount } = await client.query(
        "SELECT 1 FROM iam_elevations WHERE tenant_id = $1 AND user_ref = $2 AND permission_key = $3 AND state = 'approved' AND expires_at > $4",
        [ctx.tenantId, ctx.userId, permissionKey, at],
      );
      return (rowCount ?? 0) > 0;
    },
    { tenantId: ctx.tenantId },
  );
}

/** The role decision, or an approved elevation for a privileged permission. The reason says which one applied. */
export async function decideWithElevation(pool: Pool, ctx: RequestContext, key: string, resource?: Resource): Promise<{ allowed: boolean; via: "role" | "elevation" | "none"; reason: string }> {
  const role = await can(pool, ctx, key, resource);
  if (role.allowed) return { allowed: true, via: "role", reason: role.reason };
  if (await isElevated(pool, ctx, key)) return { allowed: true, via: "elevation", reason: `elevated for ${key}` };
  return { allowed: false, via: "none", reason: role.reason };
}
