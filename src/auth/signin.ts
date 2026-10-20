// Sign-in, sign-out and password change (Part 08A slice S1; REQ-AUTH-F06, F08, F10, F18). Sign-in is the Part 07 engine plus the
// account-state gate. A user whose account is suspended, deactivated, not yet valid or expired gets the generic refusal.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { writeAudit } from "../secgov/audit";
import { login, revokeSession, type Keys, type StateGate } from "../iam/auth";
import { hashPassword, passwordProblems, verifyPassword } from "../iam/crypto";

export const GENERIC_SIGN_IN = "User ID or password is incorrect";
export const PASSWORD_HISTORY = 5;

/** Allows sign-in only for an active or pending user whose validity window holds. Users with no user record are allowed (A-33). */
export const accountGate: StateGate = async (client: PoolClient, tenantId: string, userRef: string, now: Date) => {
  const { rows } = await client.query<{ state: string; valid: boolean }>(
    "SELECT state, (valid_from <= $3::date AND (valid_to IS NULL OR valid_to >= $3::date)) AS valid FROM auth_users WHERE tenant_id = $1 AND user_id = $2",
    [tenantId, userRef, now.toISOString().slice(0, 10)],
  );
  if (rows.length === 0) return true;
  return rows[0].valid && (rows[0].state === "active" || rows[0].state === "pending_activation");
};

/** Signs a person in. Every refusal is the same generic answer, whatever the reason. */
export async function signIn(pool: Pool, keys: Keys, input: { tenantId: string; userId: string; password: string; deviceFingerprint: string; mfaCode?: string; now?: Date }) {
  try {
    return await login(pool, keys, { ...input, userRef: input.userId, stateGate: accountGate });
  } catch (error) {
    // The code prompt is shown only after the password is proven, so it reveals nothing the caller did not already know.
    if (error instanceof AppError && error.code === "FORBIDDEN" && error.reason !== "a one-time code is required") {
      // The reason stays in the login history and the security events; the caller sees only the generic answer.
      throw new AppError("FORBIDDEN", GENERIC_SIGN_IN);
    }
    throw error;
  }
}

export async function signOut(pool: Pool, tenantId: string, sessionId: string): Promise<void> {
  await revokeSession(pool, tenantId, sessionId, "signed out");
}

export async function mustChangePassword(pool: Pool, tenantId: string, userId: string): Promise<boolean> {
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ must_change: boolean }>("SELECT must_change FROM auth_users WHERE tenant_id = $1 AND user_id = $2", [tenantId, userId]);
      return rows[0]?.must_change ?? false;
    },
    { tenantId },
  );
}

/**
 * Changes the signed-in person's password. Requires the current one. The new one must meet the policy and differ from the last
 * five. Every other session of the person ends; the current session may be kept.
 */
export async function changePassword(pool: Pool, ctx: RequestContext, input: { current: string; next: string; keepSessionId?: string | null }): Promise<void> {
  const problems = passwordProblems(input.next, ctx.userId);
  if (input.next === input.current) problems.push("not the same as the current password");
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", `the new password must be ${problems.join(", ")}`, [{ field: "next", message: problems.join(", ") }]);
  await withTransaction(
    pool,
    async (client) => {
      const cred = await client.query<{ password_hash: string }>("SELECT password_hash FROM iam_credentials WHERE tenant_id = $1 AND user_ref = $2 FOR UPDATE", [ctx.tenantId, ctx.userId]);
      if (cred.rowCount === 0) throw new AppError("NOT_FOUND", "no credentials exist for this user");
      if (!verifyPassword(input.current, cred.rows[0].password_hash).ok) throw new AppError("FORBIDDEN", "the current password is not correct");
      const history = await client.query<{ password_hash: string }>("SELECT password_hash FROM auth_password_history WHERE tenant_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3", [ctx.tenantId, ctx.userId, PASSWORD_HISTORY]);
      if (history.rows.some((h) => verifyPassword(input.next, h.password_hash).ok)) throw new AppError("VALIDATION_FAILED", "that password was used recently; choose a new one", [{ field: "next", message: "recently used" }]);
      const fresh = hashPassword(input.next);
      await client.query("UPDATE iam_credentials SET password_hash = $3, changed_at = now() WHERE tenant_id = $1 AND user_ref = $2", [ctx.tenantId, ctx.userId, fresh]);
      await client.query("INSERT INTO auth_password_history (tenant_id, user_id, password_hash) VALUES ($1, $2, $3)", [ctx.tenantId, ctx.userId, fresh]);
      await client.query("UPDATE auth_users SET must_change = false WHERE tenant_id = $1 AND user_id = $2", [ctx.tenantId, ctx.userId]);
      await client.query(
        "UPDATE iam_sessions SET revoked_at = now(), revoke_reason = 'password changed' WHERE tenant_id = $1 AND user_ref = $2 AND revoked_at IS NULL AND ($3::text IS NULL OR id::text <> $3)",
        [ctx.tenantId, ctx.userId, input.keepSessionId ?? null],
      );
      await writeAudit(client, ctx, { action: "auth.password.changed", entityType: "user", entityId: ctx.userId, after: { sessionsKept: input.keepSessionId ? 1 : 0 } });
    },
    { tenantId: ctx.tenantId },
  );
}
