// Backup and restore check (Part 03 REQ-DBF-F12). Dumps MIGRATOR's database, restores into a separate database, and compares
// every sys table row by row. The restored database is dropped afterwards. Prints the timings (measured RPO and RTO for this database).
//   npm run db:restore-check
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./load-env";
import { requireUrl } from "../../src/db/config";
import { createPool } from "../../src/db/pool";
import { loadMigrations } from "../../src/db/migrations";
import { migrationStatus } from "../../src/db/migrator";

const run = promisify(execFile);
loadLocalEnv();
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const source = requireUrl("MIGRATOR_DATABASE_URL");
const sourceDb = new URL(source).pathname.slice(1);
const RESTORE_DB = "erp_restore_check";
const SYS_TABLES = [
  "migration_runs", "idempotency_keys", "outbox", "backfill_batches", "integrity_invariants",
  "integrity_snapshots", "integrity_findings", "acp_runs", "acp_diffs", "legacy_loads",
] as const;

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

async function fingerprint(url: string): Promise<Record<string, string>> {
  const pool = createPool(url, { max: 2, application_name: "erp-restore-check" });
  try {
    const out: Record<string, string> = {};
    for (const table of SYS_TABLES) {
      const { rows } = await pool.query<{ n: string; fp: string }>(
        `SELECT count(*)::text AS n, COALESCE(md5(string_agg(x::text, E'\\n' ORDER BY x::text)), '') AS fp FROM sys.${table} AS x`,
      );
      out[table] = `${rows[0].n}:${rows[0].fp}`;
    }
    return out;
  } finally {
    await pool.end();
  }
}

async function main(): Promise<number> {
  const dir = join(root, "backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${sourceDb}-${Date.now()}.dump`);

  const t0 = Date.now();
  await run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--file=${file}`, `--dbname=${source}`]);
  const dumpMs = Date.now() - t0;
  const bytes = statSync(file).size;

  const admin = createPool(withDatabase(source, "postgres"), { max: 1, application_name: "erp-restore-check-admin" });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${RESTORE_DB}`);
    await admin.query(`CREATE DATABASE ${RESTORE_DB} OWNER erp_migrator`);
  } finally {
    await admin.end();
  }
  const restoreUrl = withDatabase(source, RESTORE_DB);

  let exitCode = 0;
  try {
    const t1 = Date.now();
    await run("pg_restore", ["--no-owner", "--no-acl", "--exit-on-error", `--dbname=${restoreUrl}`, file]);
    const restoreMs = Date.now() - t1;

    const before = await fingerprint(source);
    const after = await fingerprint(restoreUrl);
    const mismatched = SYS_TABLES.filter((t) => before[t] !== after[t]);
    const restored = createPool(restoreUrl, { max: 1, application_name: "erp-restore-check-verify" });
    const migrations = loadMigrations(join(root, "db/migrations"));
    const status = await migrationStatus(restored, migrations);
    await restored.end();

    console.log(`dump:    ${bytes} bytes in ${dumpMs} ms  (${file})`);
    console.log(`restore: ${restoreMs} ms into ${RESTORE_DB}`);
    console.log(`tables compared: ${SYS_TABLES.length}; differences: ${mismatched.length ? mismatched.join(", ") : "none"}`);
    console.log(`migrations applied in restored copy: ${status.filter((s) => s.applied && s.checksumMatches).length}/${status.length}`);
    if (mismatched.length > 0 || status.some((s) => !s.applied || !s.checksumMatches)) exitCode = 1;
    console.log(exitCode === 0 ? "RESULT: restore verified" : "RESULT: restore differs");
  } finally {
    const cleanup = createPool(withDatabase(source, "postgres"), { max: 1, application_name: "erp-restore-check-cleanup" });
    await cleanup.query(`DROP DATABASE IF EXISTS ${RESTORE_DB}`).catch(() => undefined);
    await cleanup.end();
  }
  return exitCode;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(`restore check failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
