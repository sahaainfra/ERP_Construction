// Authentication services (Part 07 slice S1; REQ-IAM-F01, F03, F04). The sign-in page, provisioning screens and login activity
// log belong to Part 08A and call these. A login never says whether the user exists or which factor failed.
import { randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import { withTransaction } from "../db/transactions";
import { sha256Hex as hashOf } from "./crypto";
import { base32Encode, decryptSecret, encryptSecret, hashPassword, passwordProblems, randomToken, sha256Hex, signToken, verifyPassword, verifyToken, verifyTotp, type loadKeys } from "./crypto";

export type Keys = ReturnType<typeof loadKeys>;

export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const ACCESS_TOKEN_SECONDS = 10 * 60;
export const IDLE_SESSION_MINUTES = 8 * 60;
export const ABSOLUTE_SESSION_HOURS = 12;
export const RESET_TOKEN_MINUTES = 30;
const TOKEN_AUDIENCE = "erp-api";
const KEEP_PREVIOUS_REFRESH = 10;

/** A fixed hash so that an unknown user costs the same time as a known one (no account enumeration by timing). */
const DUMMY_HASH = hashPassword("not-a-real-password-for-timing-only");

const GENERIC = "invalid credentials";

async function revokedPerson(client: PoolClient, tenantId: string, userRef: string): Promise<boolean> {
  const { rowCount } = await client.query("SELECT 1 FROM iam_revocations WHERE tenant_id = $1 AND user_ref = $2 AND cleared_at IS NULL", [tenantId, userRef]);
  return (rowCount ?? 0) > 0;
}

/** Records one login outcome for detection (Part 08 S2). Written inside the caller's transaction, so it survives refusals. */
async function logLogin(client: PoolClient, tenantId: string, userRef: string | null, outcome: string, fingerprint: string | null): Promise<void> {
  await client.query(
    "INSERT INTO sec_login_history (tenant_id, user_ref, outcome, device_hash) VALUES ($1, $2, $3, $4)",
    [tenantId, userRef, outcome, fingerprint === null ? null : hashOf(fingerprint)],
  );
}

/** Counts a failed password or code, and locks the account at the limit. Shared by every failed factor. */
async function recordFailure(client: PoolClient, tenantId: string, userRef: string, previous: number, now: Date): Promise<void> {
  const failures = previous + 1;
  const lock = failures >= LOCK_AFTER_FAILURES;
  await client.query(
    "UPDATE iam_credentials SET failed_count = $3, locked_until = $4 WHERE tenant_id = $1 AND user_ref = $2",
    [tenantId, userRef, lock ? 0 : failures, lock ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null],
  );
}

export async function createCredentials(pool: Pool, tenantId: string, userRef: string, password: string): Promise<void> {
  const problems = passwordProblems(password, userRef);
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", `the password must have ${problems.join(", ")}`, [{ field: "password", message: problems.join(", ") }]);
  try {
    await withTransaction(
      pool,
      (c) => c.query("INSERT INTO iam_credentials (tenant_id, user_ref, password_hash) VALUES ($1, $2, $3)", [tenantId, userRef, hashPassword(password)]),
      { tenantId },
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AppError("CONFLICT", "this user already has credentials");
    throw error;
  }
}

/** Signs a person in with a password and, when enrolled, a TOTP code. Locks the account after repeated failures. */
export async function login(
  pool: Pool,
  keys: Keys,
  input: { tenantId: string; userRef: string; password: string; deviceFingerprint: string; mfaCode?: string; now?: Date },
): Promise<{ accessToken: string; refreshToken: string; sessionId: string; deviceId: string }> {
  const now = input.now ?? new Date();
  const verdict = await withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ password_hash: string; failed_count: number; locked_until: Date | null }>(
        "SELECT password_hash, failed_count, locked_until FROM iam_credentials WHERE tenant_id = $1 AND user_ref = $2 FOR UPDATE",
        [input.tenantId, input.userRef],
      );
      if (rows.length === 0) {
        verifyPassword(input.password, DUMMY_HASH);
        await logLogin(client, input.tenantId, null, "failure", input.deviceFingerprint);
        return { ok: false as const };
      }
      const row = rows[0];
      // The password is always checked first, so a locked or revoked account costs the same time as any other. Lock and
      // revocation give the same answer as a wrong password: the response never shows account state without the password.
      const checked = verifyPassword(input.password, row.password_hash);
      const locked = row.locked_until !== null && row.locked_until > now;
      const revoked = await revokedPerson(client, input.tenantId, input.userRef);
      if (locked || revoked) {
        await logLogin(client, input.tenantId, input.userRef, locked ? "locked" : "revoked", input.deviceFingerprint);
        return { ok: false as const };
      }
      if (!checked.ok) {
        // Return, do not throw: a throw would roll the failure count back, and the lockout would never engage.
        await recordFailure(client, input.tenantId, input.userRef, row.failed_count, now);
        await logLogin(client, input.tenantId, input.userRef, "failure", input.deviceFingerprint);
        return { ok: false as const };
      }
      if (checked.needsRehash) {
        await client.query("UPDATE iam_credentials SET password_hash = $3 WHERE tenant_id = $1 AND user_ref = $2", [input.tenantId, input.userRef, hashPassword(input.password)]);
      }
      const factor = await client.query<{ secret_ciphertext: string; last_used_step: string }>(
        "SELECT secret_ciphertext, last_used_step FROM iam_mfa_factors WHERE tenant_id = $1 AND user_ref = $2 AND confirmed_at IS NOT NULL",
        [input.tenantId, input.userRef],
      );
      if (factor.rowCount) {
        if (!input.mfaCode) throw new AppError("FORBIDDEN", "a one-time code is required");
        const secret = decryptSecret(factor.rows[0].secret_ciphertext, keys.mfaKey);
        const result = verifyTotp(secret, input.mfaCode, now.getTime(), Number(factor.rows[0].last_used_step));
        if (!result.ok) {
          // A wrong code counts as a failure, like a wrong password. Returned, not thrown, so the count is kept.
          await recordFailure(client, input.tenantId, input.userRef, row.failed_count, now);
          await logLogin(client, input.tenantId, input.userRef, "mfa_failed", input.deviceFingerprint);
          return { ok: false as const };
        }
        await client.query("UPDATE iam_mfa_factors SET last_used_step = $3 WHERE tenant_id = $1 AND user_ref = $2 AND kind = 'totp'", [input.tenantId, input.userRef, result.step]);
      }
      await client.query("UPDATE iam_credentials SET failed_count = 0, locked_until = NULL, last_login_at = $3 WHERE tenant_id = $1 AND user_ref = $2", [input.tenantId, input.userRef, now]);
      await logLogin(client, input.tenantId, input.userRef, "success", input.deviceFingerprint);
      return { ok: true as const, mfa: factor.rowCount !== null && factor.rowCount > 0 };
    },
    { tenantId: input.tenantId },
  );
  if (!verdict.ok) throw new AppError("FORBIDDEN", GENERIC);
  return startSession(pool, keys, { tenantId: input.tenantId, userRef: input.userRef, deviceFingerprint: input.deviceFingerprint, now, mfaVerifiedAt: verdict.mfa ? now : null });
}

async function deviceFor(client: PoolClient, tenantId: string, userRef: string, fingerprint: string): Promise<{ id: string; revoked: boolean }> {
  const fp = sha256Hex(fingerprint);
  const { rows } = await client.query<{ id: string; revoked_at: Date | null }>(
    `INSERT INTO iam_devices (tenant_id, user_ref, fingerprint_hash) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, user_ref, fingerprint_hash) DO UPDATE SET last_seen = now() RETURNING id, revoked_at`,
    [tenantId, userRef, fp],
  );
  return { id: rows[0].id, revoked: rows[0].revoked_at !== null };
}

export async function startSession(pool: Pool, keys: Keys, input: { tenantId: string; userRef: string; deviceFingerprint: string; now?: Date; mfaVerifiedAt?: Date | null }): Promise<{ accessToken: string; refreshToken: string; sessionId: string; deviceId: string }> {
  const now = input.now ?? new Date();
  const refreshToken = randomToken(32);
  return withTransaction(
    pool,
    async (client) => {
      const device = await deviceFor(client, input.tenantId, input.userRef, input.deviceFingerprint);
      if (device.revoked) throw new AppError("FORBIDDEN", "this device has been revoked");
      const idle = new Date(now.getTime() + IDLE_SESSION_MINUTES * 60_000);
      const absolute = new Date(now.getTime() + ABSOLUTE_SESSION_HOURS * 3_600_000);
      const { rows } = await client.query<{ id: string; family_id: string }>(
        `INSERT INTO iam_sessions (tenant_id, user_ref, device_id, family_id, refresh_hash, idle_expires_at, absolute_expires_at, created_at, last_seen, mfa_verified_at)
         VALUES ($1, $2, $3, gen_random_uuid(), $4, $5, $6, $7, $7, $8) RETURNING id, family_id`,
        [input.tenantId, input.userRef, device.id, sha256Hex(refreshToken), idle, absolute, now, input.mfaVerifiedAt ?? null],
      );
      const accessToken = signToken({ sub: input.userRef, tid: input.tenantId, sid: rows[0].id, aud: TOKEN_AUDIENCE, iat: Math.floor(now.getTime() / 1000), exp: Math.floor(now.getTime() / 1000) + ACCESS_TOKEN_SECONDS }, keys.tokenKey);
      return { accessToken, refreshToken, sessionId: rows[0].id, deviceId: device.id };
    },
    { tenantId: input.tenantId },
  );
}

/**
 * Exchanges a refresh token for a new one. The old token is kept as a previous hash: if it is presented again, the token
 * was copied, so every session of that sign-in is revoked.
 */
export async function refreshSession(pool: Pool, keys: Keys, input: { tenantId: string; refreshToken: string; now?: Date }): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const now = input.now ?? new Date();
  const presented = sha256Hex(input.refreshToken);
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ id: string; family_id: string; user_ref: string; refresh_hash: string; previous_hashes: string[]; revoked_at: Date | null; idle_expires_at: Date; absolute_expires_at: Date; device_id: string }>(
        "SELECT id, family_id, user_ref, refresh_hash, previous_hashes, revoked_at, idle_expires_at, absolute_expires_at, device_id FROM iam_sessions WHERE tenant_id = $1 AND (refresh_hash = $2 OR $2 = ANY(previous_hashes)) FOR UPDATE",
        [input.tenantId, presented],
      );
      if (rows.length === 0) throw new AppError("FORBIDDEN", "the session is not valid");
      const s = rows[0];
      if (s.refresh_hash !== presented) {
        // Commit the family revocation first; a throw here would roll it back.
        await client.query("UPDATE iam_sessions SET revoked_at = now(), revoke_reason = 'refresh token reuse' WHERE tenant_id = $1 AND family_id = $2 AND revoked_at IS NULL", [input.tenantId, s.family_id]);
        await client.query("INSERT INTO sec_login_history (tenant_id, user_ref, outcome) VALUES ($1, $2, 'token_reuse')", [input.tenantId, s.user_ref]);
        return { refused: "reuse" as const };
      }
      if (s.revoked_at || s.idle_expires_at <= now || s.absolute_expires_at <= now) return { refused: "ended" as const };
      const device = await client.query<{ revoked_at: Date | null }>("SELECT revoked_at FROM iam_devices WHERE id = $1", [s.device_id]);
      if (device.rows[0]?.revoked_at) return { refused: "device" as const };
      if (await revokedPerson(client, input.tenantId, s.user_ref)) return { refused: "revoked" as const };
      const next = randomToken(32);
      const idle = new Date(Math.min(now.getTime() + IDLE_SESSION_MINUTES * 60_000, s.absolute_expires_at.getTime()));
      const previous = [...s.previous_hashes, s.refresh_hash].slice(-KEEP_PREVIOUS_REFRESH);
      await client.query(
        "UPDATE iam_sessions SET refresh_hash = $2, previous_hashes = $3, last_seen = $4, idle_expires_at = $5 WHERE id = $1",
        [s.id, sha256Hex(next), previous, now, idle],
      );
      const accessToken = signToken({ sub: s.user_ref, tid: input.tenantId, sid: s.id, aud: TOKEN_AUDIENCE, iat: Math.floor(now.getTime() / 1000), exp: Math.floor(now.getTime() / 1000) + ACCESS_TOKEN_SECONDS }, keys.tokenKey);
      return { accessToken, refreshToken: next, sessionId: s.id, refused: null };
    },
    { tenantId: input.tenantId },
  ).then((out) => {
    switch (out.refused) {
      case "reuse":
        throw new AppError("FORBIDDEN", "the session was ended for security; sign in again");
      case "ended":
        throw new AppError("FORBIDDEN", "the session has ended; sign in again");
      case "device":
        throw new AppError("FORBIDDEN", "this device has been revoked");
      case "revoked":
        throw new AppError("FORBIDDEN", "access is revoked");
      default:
        return { accessToken: out.accessToken, refreshToken: out.refreshToken, sessionId: out.sessionId };
    }
  });
}

/** Checks an access token: signature, audience, expiry, and that its session, device and person are still good. */
export async function verifyAccess(pool: Pool, keys: Keys, input: { tenantId: string; accessToken: string; now?: Date }): Promise<{ userRef: string; sessionId: string }> {
  const now = input.now ?? new Date();
  let claims: Record<string, unknown>;
  try {
    claims = verifyToken(input.accessToken, keys.tokenKey);
  } catch {
    throw new AppError("FORBIDDEN", "the access token is not valid");
  }
  if (claims.aud !== TOKEN_AUDIENCE || claims.tid !== input.tenantId || typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) {
    throw new AppError("FORBIDDEN", "the access token is not valid");
  }
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ revoked_at: Date | null; idle_expires_at: Date; absolute_expires_at: Date; device_revoked: Date | null }>(
        `SELECT s.revoked_at, s.idle_expires_at, s.absolute_expires_at, d.revoked_at AS device_revoked
           FROM iam_sessions s JOIN iam_devices d ON d.id = s.device_id WHERE s.id = $1 AND s.tenant_id = $2`,
        [claims.sid, input.tenantId],
      );
      const s = rows[0];
      if (!s || s.revoked_at || s.device_revoked || s.idle_expires_at <= now || s.absolute_expires_at <= now) throw new AppError("FORBIDDEN", "the session has ended");
      if (await revokedPerson(client, input.tenantId, String(claims.sub))) throw new AppError("FORBIDDEN", "access is revoked");
      return { userRef: String(claims.sub), sessionId: String(claims.sid) };
    },
    { tenantId: input.tenantId },
  );
}

/** Whether a second factor was verified on this session within the window. Step-up actions require it. */
export async function stepUpFresh(pool: Pool, tenantId: string, sessionId: string, now: Date = new Date(), maxMinutes = 5): Promise<boolean> {
  return withTransaction(
    pool,
    async (client) => {
      const { rowCount } = await client.query("SELECT 1 FROM iam_sessions WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL AND mfa_verified_at > $3", [sessionId, tenantId, new Date(now.getTime() - maxMinutes * 60_000)]);
      return (rowCount ?? 0) > 0;
    },
    { tenantId },
  );
}

export async function revokeSession(pool: Pool, tenantId: string, sessionId: string, reason: string): Promise<void> {
  await withTransaction(pool, (c) => c.query("UPDATE iam_sessions SET revoked_at = now(), revoke_reason = $3 WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL", [sessionId, tenantId, reason]), { tenantId });
}

/** Revokes a device and every session on it. Its queued offline submissions are refused at their next sync (Part 14). */
export async function revokeDevice(pool: Pool, tenantId: string, deviceId: string, reason: string): Promise<number> {
  return withTransaction(
    pool,
    async (client) => {
      await client.query("UPDATE iam_devices SET revoked_at = now() WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL", [deviceId, tenantId]);
      const res = await client.query("UPDATE iam_sessions SET revoked_at = now(), revoke_reason = $3 WHERE device_id = $1 AND tenant_id = $2 AND revoked_at IS NULL", [deviceId, tenantId, reason]);
      return res.rowCount ?? 0;
    },
    { tenantId },
  );
}

/** Starts a reset. Returns the one-time token for delivery (Part 25), or null for an unknown user, so the caller answers the same way either way. */
export async function requestPasswordReset(pool: Pool, tenantId: string, userRef: string, now: Date = new Date()): Promise<string | null> {
  return withTransaction(
    pool,
    async (client) => {
      const known = await client.query("SELECT 1 FROM iam_credentials WHERE tenant_id = $1 AND user_ref = $2", [tenantId, userRef]);
      if ((known.rowCount ?? 0) === 0) {
        // Same work as a known user, so the answer does not reveal whether the account exists.
        verifyPassword("not-a-real-password-for-timing-only", DUMMY_HASH);
        return null;
      }
      const token = randomToken(32);
      await client.query(
        "INSERT INTO iam_password_resets (tenant_id, user_ref, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
        [tenantId, userRef, sha256Hex(token), new Date(now.getTime() + RESET_TOKEN_MINUTES * 60_000)],
      );
      return token;
    },
    { tenantId },
  );
}

/** Redeems a reset token once. Sets the password, clears any lock, and ends every session of the person. */
export async function redeemPasswordReset(pool: Pool, tenantId: string, token: string, newPassword: string, now: Date = new Date()): Promise<void> {
  await withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ id: string; user_ref: string }>(
        "SELECT id, user_ref FROM iam_password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 FOR UPDATE",
        [sha256Hex(token), now],
      );
      if (rows.length === 0) throw new AppError("FORBIDDEN", "the reset link is not valid or has expired");
      const userRef = rows[0].user_ref;
      const problems = passwordProblems(newPassword, userRef);
      if (problems.length > 0) throw new AppError("VALIDATION_FAILED", `the password must have ${problems.join(", ")}`, [{ field: "password", message: problems.join(", ") }]);
      await client.query("UPDATE iam_password_resets SET used_at = $2 WHERE id = $1", [rows[0].id, now]);
      await client.query("UPDATE iam_credentials SET password_hash = $3, changed_at = $4, failed_count = 0, locked_until = NULL WHERE tenant_id = $1 AND user_ref = $2", [tenantId, userRef, hashPassword(newPassword), now]);
      await client.query("UPDATE iam_sessions SET revoked_at = $3, revoke_reason = 'password reset' WHERE tenant_id = $1 AND user_ref = $2 AND revoked_at IS NULL", [tenantId, userRef, now]);
    },
    { tenantId },
  );
}

/** Enrols a TOTP factor. The secret is shown once; the factor counts only after a valid code is confirmed. */
export async function enrolTotp(pool: Pool, keys: Keys, tenantId: string, userRef: string): Promise<{ secret: string; uri: string }> {
  const secret = randomBytes(20);
  const encoded = base32Encode(secret);
  await withTransaction(
    pool,
    async (c) => {
      // A confirmed factor is never replaced without a code from it (that would let a password alone switch MFA off).
      const confirmed = await c.query("SELECT 1 FROM iam_mfa_factors WHERE tenant_id = $1 AND user_ref = $2 AND confirmed_at IS NOT NULL", [tenantId, userRef]);
      if ((confirmed.rowCount ?? 0) > 0) throw new AppError("CONFLICT", "a confirmed factor exists; remove it with a current code first");
      await c.query(
      `INSERT INTO iam_mfa_factors (tenant_id, user_ref, secret_ciphertext) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, user_ref, kind) DO UPDATE SET secret_ciphertext = EXCLUDED.secret_ciphertext, confirmed_at = NULL, last_used_step = -1, enrolled_at = now()`,
      [tenantId, userRef, encryptSecret(secret, keys.mfaKey)],
      );
    },
    { tenantId },
  );
  return { secret: encoded, uri: `otpauth://totp/ERP:${encodeURIComponent(userRef)}?secret=${encoded}&issuer=ERP&period=30&digits=6` };
}

/** Removes a confirmed factor. The current code must be valid, so a password alone cannot switch MFA off. */
export async function removeTotp(pool: Pool, keys: Keys, tenantId: string, userRef: string, code: string, now: Date = new Date()): Promise<void> {
  await withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ secret_ciphertext: string; last_used_step: string }>("SELECT secret_ciphertext, last_used_step FROM iam_mfa_factors WHERE tenant_id = $1 AND user_ref = $2 AND confirmed_at IS NOT NULL FOR UPDATE", [tenantId, userRef]);
      if (rows.length === 0) throw new AppError("NOT_FOUND", "no confirmed factor exists");
      const result = verifyTotp(decryptSecret(rows[0].secret_ciphertext, keys.mfaKey), code, now.getTime(), Number(rows[0].last_used_step));
      if (!result.ok) throw new AppError("FORBIDDEN", "the one-time code is not valid");
      await client.query("UPDATE iam_mfa_factors SET confirmed_at = NULL, secret_ciphertext = '', last_used_step = $3 WHERE tenant_id = $1 AND user_ref = $2 AND kind = 'totp'", [tenantId, userRef, result.step]);
    },
    { tenantId },
  );
}

export async function confirmTotp(pool: Pool, keys: Keys, tenantId: string, userRef: string, code: string, now: Date = new Date()): Promise<void> {
  await withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ secret_ciphertext: string; last_used_step: string }>("SELECT secret_ciphertext, last_used_step FROM iam_mfa_factors WHERE tenant_id = $1 AND user_ref = $2 AND confirmed_at IS NULL", [tenantId, userRef]);
      if (rows.length === 0) throw new AppError("NOT_FOUND", "no factor is waiting for confirmation");
      const result = verifyTotp(decryptSecret(rows[0].secret_ciphertext, keys.mfaKey), code, now.getTime(), Number(rows[0].last_used_step));
      if (!result.ok) throw new AppError("VALIDATION_FAILED", "the code is not valid", [{ field: "code", message: "not valid" }]);
      await client.query("UPDATE iam_mfa_factors SET confirmed_at = $3, last_used_step = $4 WHERE tenant_id = $1 AND user_ref = $2 AND kind = 'totp'", [tenantId, userRef, now, result.step]);
    },
    { tenantId },
  );
}

