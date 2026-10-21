// Back-fill runner (Part 03 REQ-DBF-F03). Keyset-batched, resumable and reconciled per batch. Each batch commits only
// when its source and target checksums match; otherwise the batch is rolled back and the job stops.
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "./transactions";

export interface BackfillBatchResult {
  read: number;
  written: number;
  sourceChecksum: string;
  targetChecksum: string;
}

export interface BackfillJob {
  jobCode: string;
  moduleCode: string;
  minKey: number;
  maxKey: number;
  batchSize: number;
  /** Copies or derives rows in [fromKey, toKey] and returns checksums computed over the same range on both sides. */
  batch(client: PoolClient, fromKey: number, toKey: number): Promise<BackfillBatchResult>;
}

export interface BackfillOptions {
  /** Stops after this many batches in this run. Used for forced-stop tests and maintenance windows. */
  maxBatches?: number;
  /** Checked before each batch (kill switch). */
  shouldStop?: () => boolean;
}

export interface BackfillSummary {
  batchesReconciled: number;
  lastKey: number | null;
  completed: boolean;
  stoppedBy: "completed" | "max_batches" | "stop_requested" | "checksum_mismatch";
}

/** The key the next run starts from: after the last reconciled batch, or at minKey for a new job. */
export async function resumeFrom(pool: Pool, jobCode: string, minKey: number): Promise<number> {
  const { rows } = await pool.query<{ last: string | null }>(
    "SELECT max(to_key)::text AS last FROM sys.backfill_batches WHERE job_code = $1 AND status = 'reconciled'",
    [jobCode],
  );
  return rows[0].last === null ? minKey : Number(rows[0].last) + 1;
}

export async function runBackfill(pool: Pool, job: BackfillJob, options: BackfillOptions = {}): Promise<BackfillSummary> {
  let from = await resumeFrom(pool, job.jobCode, job.minKey);
  let reconciled = 0;
  let lastKey: number | null = null;
  while (from <= job.maxKey) {
    if (options.shouldStop?.()) return { batchesReconciled: reconciled, lastKey, completed: false, stoppedBy: "stop_requested" };
    if (options.maxBatches !== undefined && reconciled >= options.maxBatches) {
      return { batchesReconciled: reconciled, lastKey, completed: false, stoppedBy: "max_batches" };
    }
    const to = Math.min(from + job.batchSize - 1, job.maxKey);
    let mismatch: BackfillBatchResult | null = null;
    await withTransaction(
      pool,
      async (client) => {
        const result = await job.batch(client, from, to);
        const ok = result.sourceChecksum === result.targetChecksum;
        const { rows } = await client.query<{ n: number }>(
          "SELECT COALESCE(max(batch_no), 0) + 1 AS n FROM sys.backfill_batches WHERE job_code = $1",
          [job.jobCode],
        );
        if (!ok) {
          mismatch = result;
          throw new Error(`checksum mismatch in batch ${from}-${to}: rolled back`);
        }
        await client.query(
          `INSERT INTO sys.backfill_batches (job_code, module_code, batch_no, from_key, to_key, rows_read, rows_written,
             checksum_source, checksum_target, status, finished_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reconciled', now())`,
          [job.jobCode, job.moduleCode, rows[0].n, from, to, result.read, result.written, result.sourceChecksum, result.targetChecksum],
        );
      },
      { maxRetries: 2 },
    ).catch(async (error) => {
      if (mismatch === null) throw error;
    });
    if (mismatch !== null) return { batchesReconciled: reconciled, lastKey, completed: false, stoppedBy: "checksum_mismatch" };
    reconciled += 1;
    lastKey = to;
    from = to + 1;
  }
  return { batchesReconciled: reconciled, lastKey, completed: true, stoppedBy: "completed" };
}
