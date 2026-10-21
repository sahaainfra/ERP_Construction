import type { Pool, PoolClient } from "pg";

// Transaction helper (Part 03 REQ-DBF-F06). Every business write runs through withTransaction.
export type Isolation = "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";

export interface TxOptions {
  isolation?: Isolation;
  statementTimeoutMs?: number;
  /** Retries after serialisation failures (40001) and deadlocks (40P01). */
  maxRetries?: number;
  /** Sets app.tenant_id for the transaction (row-level security reads it). */
  tenantId?: string;
  /** Sets app.user_id for the transaction. */
  userId?: string;
}

const RETRYABLE = new Set(["40001", "40P01"]);

export function isRetryable(error: unknown): boolean {
  return typeof error === "object" && error !== null && RETRYABLE.has(String((error as { code?: unknown }).code ?? ""));
}

/** Exponential backoff with jitter: about 20 ms, 40 ms, 80 ms … Jitter avoids retry storms. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  return Math.round(2 ** attempt * 20 * (0.5 + random()));
}

export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>, options: TxOptions = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const isolation: Isolation = options.isolation ?? "READ COMMITTED";
  const timeout = Math.max(0, Math.floor(options.statementTimeoutMs ?? 10_000));
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      await client.query(`SET LOCAL statement_timeout = ${timeout}`);
      if (options.tenantId) await client.query("SELECT set_config('app.tenant_id', $1, true)", [options.tenantId]);
      if (options.userId) await client.query("SELECT set_config('app.user_id', $1, true)", [options.userId]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (attempt < maxRetries && isRetryable(error)) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Runs fn only when the advisory lock is free. Used for single-runner jobs. Released at commit or rollback. */
export class LockNotAcquired extends Error {
  constructor(key: number) {
    super(`advisory lock ${key} is held by another runner`);
    this.name = "LockNotAcquired";
  }
}

export async function withAdvisoryXactLock<T>(client: PoolClient, key: number, fn: () => Promise<T>): Promise<T> {
  const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS ok", [key]);
  if (!rows[0]?.ok) throw new LockNotAcquired(key);
  return fn();
}
