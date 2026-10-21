// Migration runner (Part 03 REQ-DBF-F02). Up, down, status and dry-run. A session advisory lock allows one runner at a time.
// Each migration runs in one transaction with lock and statement timeouts. A changed file for an applied migration is refused.
import type { Pool } from "pg";
import type { MigrationFile } from "./migrations";

const RUNNER_LOCK_KEY = 7_315_001;
const LOCK_TIMEOUT = "2s";
const STATEMENT_TIMEOUT = "120s";

export interface MigrationStatus {
  name: string;
  applied: boolean;
  checksumMatches: boolean;
}

export class MigrationDrift extends Error {
  constructor(public readonly name: string) {
    super(`${name} was applied with different content. Applied migrations are never edited; add a new migration instead.`);
    this.name = "MigrationDrift";
  }
}

async function registerExists(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>("SELECT to_regclass('sys.migration_runs') IS NOT NULL AS exists");
  return rows[0].exists;
}

interface AppliedRow {
  version: string;
  direction: "up" | "down";
  checksum: string;
}

/** The latest successful direction per version, read from the register. */
async function appliedVersions(pool: Pool): Promise<Map<string, AppliedRow>> {
  if (!(await registerExists(pool))) return new Map();
  const { rows } = await pool.query<AppliedRow>(
    `SELECT DISTINCT ON (version) version, direction, checksum
       FROM sys.migration_runs
      WHERE status = 'succeeded'
      ORDER BY version, started_at DESC, id DESC`,
  );
  const out = new Map<string, AppliedRow>();
  for (const row of rows) if (row.direction === "up") out.set(row.version, row);
  return out;
}

export async function migrationStatus(pool: Pool, migrations: readonly MigrationFile[]): Promise<MigrationStatus[]> {
  const applied = await appliedVersions(pool);
  return migrations.map((m) => {
    const row = applied.get(m.version);
    return { name: m.name, applied: row !== undefined, checksumMatches: row === undefined || row.checksum === m.checksum };
  });
}

function assertNoDrift(migrations: readonly MigrationFile[], applied: Map<string, AppliedRow>): void {
  for (const m of migrations) {
    const row = applied.get(m.version);
    if (row && row.checksum !== m.checksum) throw new MigrationDrift(m.name);
  }
}

async function recordRun(pool: Pool, m: MigrationFile, direction: "up" | "down", fields: {
  status: "succeeded" | "failed" | "rolled_back_dry_run";
  dryRun: boolean;
  durationMs: number;
  error?: string;
}): Promise<void> {
  if (!(await registerExists(pool))) return;
  await pool.query(
    `INSERT INTO sys.migration_runs (version, module_code, direction, checksum, dry_run, status, finished_at, duration_ms, error_summary)
     VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8)`,
    [m.version, m.moduleCode, direction, m.checksum, fields.dryRun, fields.status, fields.durationMs, fields.error ?? null],
  );
}

async function runInTransaction(pool: Pool, sql: string, after?: (client: import("pg").PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
    await client.query(sql);
    if (after) await after(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function withRunnerLock<T>(pool: Pool, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [RUNNER_LOCK_KEY]);
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [RUNNER_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export interface UpResult {
  name: string;
  durationMs: number;
  dryRun: boolean;
}

/**
 * Applies pending migrations in order, each in its own transaction. With dryRun, all pending migrations run in ONE transaction
 * that is rolled back at the end, so later migrations see the objects that earlier ones create. Timings are reported per migration.
 */
export async function migrateUp(pool: Pool, migrations: readonly MigrationFile[], options: { dryRun?: boolean } = {}): Promise<UpResult[]> {
  return withRunnerLock(pool, async () => {
    const applied = await appliedVersions(pool);
    assertNoDrift(migrations, applied);
    const pending = migrations.filter((m) => !applied.has(m.version));

    if (options.dryRun) {
      const client = await pool.connect();
      const results: UpResult[] = [];
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
        await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
        for (const m of pending) {
          const started = Date.now();
          await client.query(m.upSql);
          results.push({ name: m.name, durationMs: Date.now() - started, dryRun: true });
        }
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      // The register cannot record a rolled-back run before it exists; after the first real apply it can.
      for (const r of results) {
        const m = pending.find((p) => p.name === r.name);
        if (m) await recordRun(pool, m, "up", { status: "rolled_back_dry_run", dryRun: true, durationMs: r.durationMs });
      }
      return results;
    }

    const results: UpResult[] = [];
    for (const m of pending) {
      const started = Date.now();
      try {
        await runInTransaction(pool, m.upSql, async (client) => {
          const durationMs = Date.now() - started;
          await client.query(
            `INSERT INTO sys.migration_runs (version, module_code, direction, checksum, dry_run, status, finished_at, duration_ms)
             VALUES ($1, $2, 'up', $3, false, 'succeeded', now(), $4)`,
            [m.version, m.moduleCode, m.checksum, durationMs],
          );
        });
        results.push({ name: m.name, durationMs: Date.now() - started, dryRun: false });
      } catch (error) {
        await recordRun(pool, m, "up", { status: "failed", dryRun: false, durationMs: Date.now() - started, error: (error as Error).message.slice(0, 500) });
        throw error;
      }
    }
    return results;
  });
}

/** Reverts the most recent applied migration, or the last `steps` of them, in reverse order. */
export async function migrateDown(pool: Pool, migrations: readonly MigrationFile[], steps = 1): Promise<string[]> {
  return withRunnerLock(pool, async () => {
    const applied = await appliedVersions(pool);
    assertNoDrift(migrations, applied);
    const targets = migrations.filter((m) => applied.has(m.version)).reverse().slice(0, steps);
    const reverted: string[] = [];
    for (const m of targets) {
      if (m.downSql === null) throw new Error(`${m.name} has no down script`);
      const started = Date.now();
      // The register row is written inside the transaction when the register still exists after the down script.
      // The baseline's down script removes the register itself; that direction is then logged by the caller only.
      await runInTransaction(pool, m.downSql, async (client) => {
        const exists = await client.query<{ exists: boolean }>("SELECT to_regclass('sys.migration_runs') IS NOT NULL AS exists");
        if (exists.rows[0].exists) {
          await client.query(
            `INSERT INTO sys.migration_runs (version, module_code, direction, checksum, dry_run, status, finished_at, duration_ms)
             VALUES ($1, $2, 'down', $3, false, 'succeeded', now(), $4)`,
            [m.version, m.moduleCode, m.checksum, Date.now() - started],
          );
        }
      });
      reverted.push(m.name);
    }
    return reverted;
  });
}

/** Resets the register and every sys object for a clean test database. Refuses when APP_ENV is production. */
export async function resetForTests(pool: Pool): Promise<void> {
  if (process.env.APP_ENV === "production") throw new Error("resetForTests refuses to run when APP_ENV=production");
  await pool.query("DROP SCHEMA IF EXISTS sys CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  // A schema created by a non-superuser grants nothing to other roles; restore the usage that a fresh database has.
  await pool.query("GRANT USAGE ON SCHEMA public TO PUBLIC");
}
