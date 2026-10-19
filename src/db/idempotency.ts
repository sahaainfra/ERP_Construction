// Idempotency store (Part 03 REQ-DBF-F06; AC-4). A repeated request with the same key and body returns the stored response.
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { withTransaction } from "./transactions";

/** JSON with keys sorted at every level, so that equal bodies hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.keys(value as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(",")}}`;
}

export const requestHash = (body: unknown): string => createHash("sha256").update(stableStringify(body)).digest("hex");

export class IdempotencyConflict extends Error {
  constructor() {
    super("this Idempotency-Key was already used with a different request body");
    this.name = "IdempotencyConflict";
  }
}

export class IdempotencyInProgress extends Error {
  constructor() {
    super("a request with this Idempotency-Key is still in progress");
    this.name = "IdempotencyInProgress";
  }
}

export interface IdempotentResult<T> {
  replayed: boolean;
  response: T;
}

/**
 * Runs `handler` once per (scope, key). The key row and the handler's writes commit together; a failed handler removes the key,
 * so the client may retry. Concurrent duplicates wait on the unique index and then receive the stored response.
 */
export async function executeIdempotent<T>(
  pool: Pool,
  request: { scope: string; key: string; body: unknown },
  handler: () => Promise<T>,
): Promise<IdempotentResult<T>> {
  const hash = requestHash(request.body);
  return withTransaction(
    pool,
    async (client) => {
      await client.query("DELETE FROM sys.idempotency_keys WHERE scope = $1 AND idem_key = $2 AND expires_at < now()", [request.scope, request.key]);
      const inserted = await client.query(
        `INSERT INTO sys.idempotency_keys (scope, idem_key, request_hash, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (scope, idem_key) DO NOTHING`,
        [request.scope, request.key, hash],
      );
      if (inserted.rowCount === 1) {
        const response = await handler();
        await client.query(
          "UPDATE sys.idempotency_keys SET status = 'done', response = $3 WHERE scope = $1 AND idem_key = $2",
          [request.scope, request.key, JSON.stringify(response ?? null)],
        );
        return { replayed: false, response };
      }
      const existing = await client.query<{ request_hash: string; status: string; response: T }>(
        "SELECT request_hash, status, response FROM sys.idempotency_keys WHERE scope = $1 AND idem_key = $2",
        [request.scope, request.key],
      );
      const row = existing.rows[0];
      if (row.request_hash !== hash) throw new IdempotencyConflict();
      if (row.status !== "done") throw new IdempotencyInProgress();
      return { replayed: true, response: row.response };
    },
    { maxRetries: 0 },
  );
}
