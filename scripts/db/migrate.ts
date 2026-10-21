// Migration command line (Part 03 REQ-DBF-F02). Uses MIGRATOR_DATABASE_URL only.
//   npm run db:lint        lint every migration; exit 1 on any violation
//   npm run db:status      applied and pending migrations, with checksum state
//   npm run db:dry-run     run pending migrations in rolled-back transactions and report timing
//   npm run db:migrate     apply pending migrations
//   npm run db:down -- 1   revert the last migration
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./load-env";
import { requireUrl } from "../../src/db/config";
import { createPool } from "../../src/db/pool";
import { lintMigration, loadMigrations } from "../../src/db/migrations";
import { migrateDown, migrateUp, migrationStatus, MigrationDrift } from "../../src/db/migrator";

loadLocalEnv();
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const dir = join(root, "db/migrations");
const command = process.argv[2];
const migrations = loadMigrations(dir);

async function main(): Promise<number> {
  const violations = migrations.flatMap((m) => lintMigration(m).map((v) => ({ file: m.name, ...v })));
  if (command === "lint" || violations.length > 0) {
    for (const v of violations) console.log(`LINT ${v.rule.padEnd(24)} ${v.file}: ${v.message}`);
    console.log(`Linted ${migrations.length} migration(s): ${violations.length} violation(s).`);
    if (violations.length > 0) return 1;
    if (command === "lint") return 0;
  }

  const pool = createPool(requireUrl("MIGRATOR_DATABASE_URL"), { application_name: "erp-migrator" });
  try {
    if (command === "status") {
      for (const s of await migrationStatus(pool, migrations)) {
        const state = s.applied ? (s.checksumMatches ? "applied" : "APPLIED-CHANGED") : "pending";
        console.log(`${state.padEnd(16)} ${s.name}`);
      }
      return 0;
    }
    if (command === "up" || command === "dry-run") {
      const results = await migrateUp(pool, migrations, { dryRun: command === "dry-run" });
      for (const r of results) console.log(`${r.dryRun ? "DRY-RUN " : "APPLIED "} ${r.durationMs} ms  ${r.name}`);
      console.log(results.length === 0 ? "Nothing pending." : `${results.length} migration(s) ${command === "up" ? "applied" : "dry-run"}.`);
      return 0;
    }
    if (command === "down") {
      const steps = Number(process.argv[3] ?? 1);
      const reverted = await migrateDown(pool, migrations, steps);
      for (const name of reverted) console.log(`REVERTED ${name}`);
      console.log(reverted.length === 0 ? "Nothing to revert." : `${reverted.length} migration(s) reverted.`);
      return 0;
    }
    console.error("Usage: migrate.ts lint | status | up | dry-run | down [steps]");
    return 2;
  } catch (error) {
    if (error instanceof MigrationDrift) console.error(error.message);
    else console.error(`Migration failed: ${(error as Error).message}`);
    return 1;
  } finally {
    await pool.end();
  }
}

main().then((code) => process.exit(code));
