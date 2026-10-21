// Rollback rehearsal (Part 03 REQ-DBF; Part 12 review): every migration's down script must return the schema to empty, and the
// same migrations must apply again afterwards. A missing DROP in any down script fails this test.
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "./pool";
import { loadMigrations } from "./migrations";
import { migrateDown, migrateUp, migrationStatus, resetForTests } from "./migrator";

const TEST_URL = process.env.TEST_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

describe.skipIf(!TEST_URL)("migration rollback rehearsal", () => {
  let owner: Pool;

  beforeAll(() => {
    owner = createPool(TEST_URL!, { application_name: "erp-rollbacktest" });
  });

  afterAll(async () => {
    await owner?.end();
  });

  it("applies every migration, rolls every one back to an empty schema, and applies them again", async () => {
    const all = loadMigrations(dir);
    await resetForTests(owner);
    expect(await migrateUp(owner, all)).toHaveLength(all.length);
    expect(await migrateDown(owner, all, all.length)).toHaveLength(all.length);
    const left = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE 'pg_%'");
    expect(left.rows[0].n).toBe(0);
    expect(await migrateUp(owner, all)).toHaveLength(all.length);
    const status = await migrationStatus(owner, all);
    expect(status.filter((s) => !s.applied)).toEqual([]);
  });
});
