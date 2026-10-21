// Volume rehearsal (Part 04 REQ-CICD-F05). Generates 1,000,000 deterministic rows into a probe table and checks that the
// database holds exactly the rows the seed defines. Uses TEST_DATABASE_URL and drops its table afterwards.
import { createHash } from "node:crypto";
import { loadLocalEnv } from "../db/load-env";
import { requireUrl } from "../../src/db/config";
import { createPool } from "../../src/db/pool";
import { volumeRange } from "../../src/testing/volume";

loadLocalEnv(".env.test");
const SEED = 20261019;
const ROWS = 1_000_000;
const BATCH = 50_000;

async function main(): Promise<number> {
  const pool = createPool(requireUrl("TEST_DATABASE_URL"), { application_name: "erp-volume-rehearsal", statement_timeout: 300_000 });
  try {
    await pool.query("DROP TABLE IF EXISTS dbf_volume_probe");
    await pool.query("CREATE TABLE dbf_volume_probe (id bigint PRIMARY KEY, amount_paise bigint NOT NULL, code text NOT NULL)");
    const started = Date.now();
    const expected = createHash("sha256");
    // Rows are joined by newlines with none after the last, matching string_agg in the database.
    let written = 0;
    for (let from = 1; from <= ROWS; from += BATCH) {
      const to = Math.min(from + BATCH - 1, ROWS);
      const rows = volumeRange(SEED, from, to);
      for (const r of rows) {
        expected.update(`${written > 0 ? "\n" : ""}${r.id},${r.amountPaise},${r.code}`);
        written += 1;
      }
      await pool.query(
        "INSERT INTO dbf_volume_probe SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::text[])",
        [rows.map((r) => r.id), rows.map((r) => r.amountPaise), rows.map((r) => r.code)],
      );
    }
    const insertMs = Date.now() - started;
    const { rows } = await pool.query<{ n: string; digest: string }>(
      `SELECT count(*)::text AS n,
              encode(sha256(convert_to(string_agg(id::text || ',' || amount_paise::text || ',' || code, E'\\n' ORDER BY id), 'UTF8')), 'hex') AS digest
         FROM dbf_volume_probe`,
    );
    const databaseDigest = rows[0].digest;
    const expectedDigest = expected.digest("hex");
    const same = rows[0].n === String(ROWS) && databaseDigest === expectedDigest;
    console.log(`rows: ${rows[0].n}; inserted in ${insertMs} ms`);
    console.log(`digest database ${databaseDigest.slice(0, 16)}… expected ${expectedDigest.slice(0, 16)}…`);
    console.log(same ? "RESULT: the database holds exactly the seeded rows" : "RESULT: MISMATCH");
    await pool.query("DROP TABLE IF EXISTS dbf_volume_probe");
    return same ? 0 : 1;
  } finally {
    await pool.end();
  }
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(`volume rehearsal failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
