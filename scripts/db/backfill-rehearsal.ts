// Part 03 acceptance rehearsal: a 1,000,000-row back-fill, forced to stop after 30 batches, then resumed and reconciled.
// Runs against TEST_DATABASE_URL only (the rehearsal drops its own tables afterwards).
import { loadLocalEnv } from "./load-env";
import { requireUrl } from "../../src/db/config";
import { createPool } from "../../src/db/pool";
import { runBackfill, type BackfillJob } from "../../src/db/backfill";

loadLocalEnv(".env.test");
const ROWS = 1_000_000;
const BATCH = 10_000;
const STOP_AFTER = 30;

async function main(): Promise<void> {
  const pool = createPool(requireUrl("TEST_DATABASE_URL"), { application_name: "erp-backfill-rehearsal", statement_timeout: 300_000 });
  try {
    await pool.query("DROP TABLE IF EXISTS rehearsal_source, rehearsal_target");
    await pool.query("DELETE FROM sys.backfill_batches WHERE job_code = 'rehearsal_copy'").catch(() => undefined);
    await pool.query("CREATE TABLE rehearsal_source (id bigint PRIMARY KEY, amount_paise bigint NOT NULL)");
    await pool.query("CREATE TABLE rehearsal_target (id bigint PRIMARY KEY, amount_paise bigint NOT NULL)");
    const seeded = Date.now();
    await pool.query(`INSERT INTO rehearsal_source SELECT g, (g * 37) % 100000 FROM generate_series(1, ${ROWS}) g`);
    console.log(`seeded ${ROWS} source rows in ${Date.now() - seeded} ms`);

    const range = async (client: { query: typeof pool.query }, table: string, from: number, to: number) =>
      (await client.query(
        `SELECT count(*)::text AS n, COALESCE(sum(amount_paise), 0)::text AS s FROM ${table} WHERE id BETWEEN $1 AND $2`,
        [from, to],
      )).rows[0] as { n: string; s: string };

    const job: BackfillJob = {
      jobCode: "rehearsal_copy",
      moduleCode: "dbf",
      minKey: 1,
      maxKey: ROWS,
      batchSize: BATCH,
      async batch(client, from, to) {
        const copied = await client.query("INSERT INTO rehearsal_target SELECT * FROM rehearsal_source WHERE id BETWEEN $1 AND $2", [from, to]);
        const src = await range(client, "rehearsal_source", from, to);
        const dst = await range(client, "rehearsal_target", from, to);
        return {
          read: Number(src.n),
          written: copied.rowCount ?? 0,
          sourceChecksum: `${src.n}:${src.s}`,
          targetChecksum: `${dst.n}:${dst.s}`,
        };
      },
    };

    const t1 = Date.now();
    const first = await runBackfill(pool, job, { maxBatches: STOP_AFTER });
    const firstMs = Date.now() - t1;
    console.log(`run 1: ${JSON.stringify(first)} in ${firstMs} ms (forced stop)`);

    const t2 = Date.now();
    const second = await runBackfill(pool, job);
    const secondMs = Date.now() - t2;
    console.log(`run 2 (resumed): ${JSON.stringify(second)} in ${secondMs} ms`);

    const src = await range(pool, "rehearsal_source", 1, ROWS);
    const dst = await range(pool, "rehearsal_target", 1, ROWS);
    const batches = await pool.query<{ n: string; last: string }>(
      "SELECT count(*)::text AS n, max(to_key)::text AS last FROM sys.backfill_batches WHERE job_code = 'rehearsal_copy' AND status = 'reconciled'",
    );
    const exact = src.n === dst.n && src.s === dst.s;
    console.log(`reconciled batches: ${batches.rows[0].n} (last key ${batches.rows[0].last})`);
    console.log(`source rows ${src.n}, target rows ${dst.n}, source sum ${src.s}, target sum ${dst.s}`);
    console.log(exact ? "RESULT: reconciles exactly" : "RESULT: MISMATCH");

    await pool.query("DROP TABLE IF EXISTS rehearsal_source, rehearsal_target");
    if (!exact || !second.completed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`rehearsal failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
