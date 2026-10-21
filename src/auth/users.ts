// Users, User IDs and account states (Part 08A slice S1; REQ-AUTH-F01, F02, F04, F17). Users are created by an administrator
// only (no self-registration). Suspending or deactivating a user ends their sessions at once (CP-AUTH-04).
import { randomInt } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { writeAudit } from "../secgov/audit";
import { withTransaction } from "../db/transactions";
import { can } from "../iam/pdp";
import { insertCredentials } from "../iam/auth";
import { passwordProblems } from "../iam/crypto";

export const USER_PERMISSIONS = [
  { key: "auth.user.manage", module: "auth", description: "Create, suspend and deactivate users", stage: "APPROVE", sensitivity: "privileged" },
] as const;

export type AccountState = "pending_activation" | "active" | "locked" | "suspended" | "deactivated" | "expired";

/** Admin-driven moves only. Reactivation of a deactivated user needs a reviewed request (Part 08A S3). */
export const STATE_MOVES: Record<AccountState, readonly AccountState[]> = {
  pending_activation: ["suspended", "deactivated"],
  active: ["suspended", "deactivated"],
  suspended: ["active", "deactivated"],
  locked: [],
  deactivated: [],
  expired: ["deactivated"],
};

/** Next value of the company's sequence. Gap-free per company, never reused (REQ-AUTH-F01). Call inside a transaction. */
export async function nextUserId(client: PoolClient, tenantId: string, companyCode: string): Promise<string> {
  const { rows } = await client.query<{ seq: string }>(
    `INSERT INTO auth_id_series (tenant_id, company_code, next_value) VALUES ($1, $2, 2)
     ON CONFLICT (tenant_id, company_code) DO UPDATE SET next_value = auth_id_series.next_value + 1
     RETURNING next_value - 1 AS seq`,
    [tenantId, companyCode],
  );
  return `${companyCode}${String(Number(rows[0].seq)).padStart(5, "0")}`;
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** A server-generated one-time password that meets the policy. Shown or delivered once; never stored in clear. */
export function generateInitialPassword(userRef: string, length = 16): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let out = "";
    for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
    if (passwordProblems(out, userRef).length === 0) return out;
  }
  throw new Error("could not generate a policy-compliant password");
}

export interface NewUser {
  companyCode: string;
  personType: "internal" | "field" | "kiosk" | "external" | "service";
  personRef?: string | null;
  displayName: string;
  validFrom?: string;
  validTo?: string | null;
  reason: string;
}

/**
 * Creates a user with a new User ID and a one-time initial password. The password is returned once, to the caller, who must
 * deliver it under dual control (activation delivery is Part 08A S2). Refuses a second live user for the same person.
 */
export async function createUser(pool: Pool, ctx: RequestContext, input: NewUser): Promise<{ userId: string; initialPassword: string }> {
  const allowed = await can(pool, ctx, "auth.user.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(input.companyCode)) throw new AppError("VALIDATION_FAILED", "the company code is not valid", [{ field: "companyCode", message: "upper-case letters and digits" }]);
  if (input.displayName.trim().length < 2) throw new AppError("VALIDATION_FAILED", "the name is too short", [{ field: "displayName", message: "too short" }]);
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short", [{ field: "reason", message: "too short" }]);
  if (input.validTo && input.validFrom && input.validTo < input.validFrom) throw new AppError("VALIDATION_FAILED", "the end date is before the start date");

  return withTransaction(
    pool,
    async (client) => {
      if (input.personRef) {
        const dup = await client.query("SELECT 1 FROM auth_users WHERE tenant_id = $1 AND person_ref = $2 AND person_type = $3 AND state <> 'deactivated'", [ctx.tenantId, input.personRef, input.personType]);
        if ((dup.rowCount ?? 0) > 0) throw new AppError("CONFLICT", "a live user already exists for this person");
      }
      const userId = await nextUserId(client, ctx.tenantId, input.companyCode);
      await client.query(
        `INSERT INTO auth_users (tenant_id, user_id, person_type, person_ref, display_name, valid_from, valid_to, created_by, state_reason)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, $9)`,
        [ctx.tenantId, userId, input.personType, input.personRef ?? null, input.displayName, input.validFrom ?? null, input.validTo ?? null, ctx.userId, input.reason],
      );
      // The credential is written in this transaction, so a failure anywhere below leaves no user and no credential behind.
      const initialPassword = generateInitialPassword(userId);
      const hash = await insertCredentials(client, ctx.tenantId, userId, initialPassword);
      await client.query("INSERT INTO auth_password_history (tenant_id, user_id, password_hash) VALUES ($1, $2, $3)", [ctx.tenantId, userId, hash]);
      await writeAudit(client, ctx, { action: "auth.user.created", entityType: "user", entityId: userId, after: { personType: input.personType, state: "pending_activation" }, reason: input.reason });
      return { userId, initialPassword };
    },
    { tenantId: ctx.tenantId },
  );
}

/** Moves a user along an allowed state change. Suspension and deactivation end every session the user holds at once. */
export async function setState(pool: Pool, ctx: RequestContext, input: { userId: string; to: AccountState; reason: string }): Promise<void> {
  const allowed = await can(pool, ctx, "auth.user.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  if (input.userId === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "an administrator cannot change their own account state");
  await withTransaction(
    pool,
    async (client) => {
      const current = await client.query<{ state: AccountState }>("SELECT state FROM auth_users WHERE tenant_id = $1 AND user_id = $2 FOR UPDATE", [ctx.tenantId, input.userId]);
      if (current.rowCount === 0) throw new AppError("NOT_FOUND", "the user was not found");
      const from = current.rows[0].state;
      if (!STATE_MOVES[from].includes(input.to)) throw new AppError("VALIDATION_FAILED", `a user cannot move from ${from} to ${input.to}`);
      await client.query("UPDATE auth_users SET state = $3, state_reason = $4 WHERE tenant_id = $1 AND user_id = $2", [ctx.tenantId, input.userId, input.to, input.reason]);
      if (input.to === "suspended" || input.to === "deactivated") {
        await client.query("UPDATE iam_sessions SET revoked_at = now(), revoke_reason = $3 WHERE tenant_id = $1 AND user_ref = $2 AND revoked_at IS NULL", [ctx.tenantId, input.userId, `account ${input.to}`]);
      }
      await writeAudit(client, ctx, { action: `auth.user.${input.to}`, entityType: "user", entityId: input.userId, after: { from, to: input.to }, reason: input.reason });
    },
    { tenantId: ctx.tenantId },
  );
}

export async function getUser(pool: Pool, ctx: RequestContext, userId: string): Promise<{ userId: string; state: AccountState; mustChange: boolean; validFrom: string; validTo: string | null } | null> {
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ user_id: string; state: AccountState; must_change: boolean; valid_from: string; valid_to: string | null }>(
        "SELECT user_id, state, must_change, to_char(valid_from, 'YYYY-MM-DD') AS valid_from, to_char(valid_to, 'YYYY-MM-DD') AS valid_to FROM auth_users WHERE tenant_id = $1 AND user_id = $2",
        [ctx.tenantId, userId],
      );
      if (rows.length === 0) return null;
      return { userId: rows[0].user_id, state: rows[0].state, mustChange: rows[0].must_change, validFrom: rows[0].valid_from, validTo: rows[0].valid_to };
    },
    { tenantId: ctx.tenantId },
  );
}
