// Credential vault (Part 11 REQ-INTG-F02; CP-INTG-02; A-58). A connector secret is encrypted at once with AES-256-GCM under a key from
// the environment (INTG_VAULT_KEY, 32 bytes, base64). It is never stored in clear and never returned by any function here. A change
// is a new version that someone other than its proposer approves; approval makes it the active version and supersedes the old one.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { writeAudit } from "../secgov/audit";
import { can } from "../iam/pdp";
import { decryptSecret, encryptSecret } from "../iam/crypto";
import { sameActor } from "../iam/actors";
import { CONNECTOR_CODE } from "./connectors";

const MIN_SECRET_LENGTH = 16;

/** The vault key from the environment. Refuses a missing or wrong-size key, so no secret is ever written without encryption. */
export function loadVaultKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const key = Buffer.from(env.INTG_VAULT_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("INTG_VAULT_KEY is missing or not 32 bytes (base64). See LOCALHOST.md.");
  return key;
}

async function requirePermission(pool: Pool, ctx: RequestContext, key: string): Promise<void> {
  const decision = await can(pool, ctx, key);
  if (!decision.allowed) throw new AppError("FORBIDDEN", decision.reason);
}

/** Proposes a new secret version. Returns the version number only; the secret is not echoed, logged or stored in clear. */
export async function proposeCredential(pool: Pool, ctx: RequestContext, key: Buffer, input: { connectorCode: string; secret: string; reason: string }): Promise<{ version: number }> {
  await requirePermission(pool, ctx, "intg.credential.manage");
  const problems: { field: string; message: string }[] = [];
  if (!CONNECTOR_CODE.test(input.connectorCode)) problems.push({ field: "connectorCode", message: "not a valid connector code" });
  if (input.secret.length < MIN_SECRET_LENGTH) problems.push({ field: "secret", message: `at least ${MIN_SECRET_LENGTH} characters` });
  if (input.reason.trim().length < 10) problems.push({ field: "reason", message: "at least 10 characters" });
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the credential is not valid", problems);
  const ciphertext = encryptSecret(Buffer.from(input.secret, "utf8"), key);

  return withTransaction(
    pool,
    async (client) => {
      const connector = await client.query("SELECT 1 FROM intg_connectors WHERE tenant_id = $1 AND code = $2", [ctx.tenantId, input.connectorCode]);
      if ((connector.rowCount ?? 0) === 0) throw new AppError("NOT_FOUND", "the connector was not found");
      const { rows } = await client.query<{ version: number }>(
        "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM intg_credentials_ref WHERE tenant_id = $1 AND connector_code = $2",
        [ctx.tenantId, input.connectorCode],
      );
      const version = rows[0].version;
      await client.query(
        "INSERT INTO intg_credentials_ref (tenant_id, connector_code, version, ciphertext, status, created_by, reason) VALUES ($1, $2, $3, $4, 'pending_approval', $5, $6)",
        [ctx.tenantId, input.connectorCode, version, ciphertext, ctx.userId, input.reason],
      );
      await writeAudit(client, ctx, { action: "intg.credential.proposed", entityType: "connector_credential", entityId: `${input.connectorCode}#${version}`, reason: input.reason });
      return { version };
    },
    { tenantId: ctx.tenantId },
  );
}

/** Approves a proposed version. The approver must not be the proposer (maker-checker, CP-INTG-02). */
export async function approveCredential(pool: Pool, ctx: RequestContext, input: { connectorCode: string; version: number; reason: string }): Promise<void> {
  await requirePermission(pool, ctx, "intg.credential.approve");
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short", [{ field: "reason", message: "at least 10 characters" }]);
  await withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ status: string; created_by: string }>(
        "SELECT status, created_by FROM intg_credentials_ref WHERE tenant_id = $1 AND connector_code = $2 AND version = $3 FOR UPDATE",
        [ctx.tenantId, input.connectorCode, input.version],
      );
      if (rows.length === 0) throw new AppError("NOT_FOUND", "the credential version was not found");
      if (rows[0].status !== "pending_approval") throw new AppError("CONFLICT", "this credential version is no longer pending approval");
      if (await sameActor(client, ctx.tenantId, rows[0].created_by, ctx.userId)) {
        throw new AppError("MAKER_CHECKER_REQUIRED", "the person who proposed a credential cannot approve it");
      }
      await client.query("UPDATE intg_credentials_ref SET status = 'superseded' WHERE tenant_id = $1 AND connector_code = $2 AND status = 'active'", [ctx.tenantId, input.connectorCode]);
      await client.query(
        "UPDATE intg_credentials_ref SET status = 'active', approved_by = $4, approved_at = now() WHERE tenant_id = $1 AND connector_code = $2 AND version = $3",
        [ctx.tenantId, input.connectorCode, input.version, ctx.userId],
      );
      await writeAudit(client, ctx, { action: "intg.credential.approved", entityType: "connector_credential", entityId: `${input.connectorCode}#${input.version}`, reason: input.reason });
    },
    { tenantId: ctx.tenantId },
  );
}

/**
 * Internal read for a connector's own call. Not exposed through any route: the connector calls it inside `callConnector` and uses
 * the value in the request, and the value is not returned to the caller of an API.
 */
export async function readActiveSecret(pool: Pool, tenantId: string, connectorCode: string, key: Buffer): Promise<Buffer | null> {
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ ciphertext: string }>(
        "SELECT ciphertext FROM intg_credentials_ref WHERE tenant_id = $1 AND connector_code = $2 AND status = 'active'",
        [tenantId, connectorCode],
      );
      return rows.length === 0 ? null : decryptSecret(rows[0].ciphertext, key);
    },
    { tenantId },
  );
}
