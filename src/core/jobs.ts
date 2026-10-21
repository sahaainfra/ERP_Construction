// Job queue (Part 05 REQ-CORE-F14). Database-backed; claims use SKIP LOCKED per tenant; retries back off; exhausted jobs are dead.
// Every statement runs in a transaction that sets the tenant, so row-level security applies (ADR-002).
import type { Pool } from "pg";
import { withTransaction } from "../db/transactions";

export interface JobRecord {
  id: number;
  jobType: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

/** Retry delay in seconds: 30 s, 60 s, 120 s … capped at one hour. */
export function backoffSeconds(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

export async function enqueueJob(pool: Pool, tenantId: string, job: { type: string; payload?: Record<string, unknown>; idempotencyKey: string; maxAttempts?: number }): Promise<number | null> {
  if (!/^[a-z][a-z0-9_.]*$/.test(job.type)) throw new RangeError("job type must be lower-case dotted text");
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO core_jobs (tenant_id, job_type, payload, idempotency_key, max_attempts)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`,
        [tenantId, job.type, JSON.stringify(job.payload ?? {}), job.idempotencyKey, job.maxAttempts ?? 5],
      );
      return rows.length === 0 ? null : Number(rows[0].id);
    },
    { tenantId },
  );
}

/**
 * Claims up to `limit` runnable jobs for one tenant. Two workers never receive the same job. A job whose lock has expired
 * (its worker crashed while it ran) is claimed again.
 */
export async function claimJobs(pool: Pool, tenantId: string, limit = 10, lockSeconds = 300): Promise<JobRecord[]> {
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ id: string; job_type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number }>(
        `SELECT id, job_type, payload, attempts, max_attempts FROM core_jobs
          WHERE (status = 'queued' AND run_after <= now()) OR (status = 'running' AND locked_until < now())
          ORDER BY run_after, id LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [limit],
      );
      for (const r of rows) {
        await client.query(
          "UPDATE core_jobs SET status = 'running', attempts = attempts + 1, locked_until = now() + make_interval(secs => $2) WHERE id = $1",
          [r.id, lockSeconds],
        );
      }
      return rows.map((r) => ({ id: Number(r.id), jobType: r.job_type, payload: r.payload, attempts: r.attempts + 1, maxAttempts: r.max_attempts }));
    },
    { tenantId },
  );
}

export async function completeJob(pool: Pool, tenantId: string, jobId: number): Promise<void> {
  await withTransaction(
    pool,
    (client) => client.query("UPDATE core_jobs SET status = 'succeeded', finished_at = now(), locked_until = NULL WHERE id = $1 AND tenant_id = $2", [jobId, tenantId]),
    { tenantId },
  );
}

/** Records a failure: retried with backoff until max attempts, then dead (kept for inspection, never deleted). */
export async function failJob(pool: Pool, tenantId: string, job: JobRecord, error: string): Promise<"retry" | "dead"> {
  const dead = job.attempts >= job.maxAttempts;
  await withTransaction(
    pool,
    (client) =>
      client.query(
        `UPDATE core_jobs SET status = $3, last_error = $4, locked_until = NULL,
                run_after = now() + make_interval(secs => $5), finished_at = CASE WHEN $3 = 'dead' THEN now() ELSE NULL END
          WHERE id = $1 AND tenant_id = $2`,
        [job.id, tenantId, dead ? "dead" : "queued", error.slice(0, 500), backoffSeconds(job.attempts)],
      ),
    { tenantId },
  );
  return dead ? "dead" : "retry";
}
