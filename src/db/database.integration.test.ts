// Database tests (Part 03 acceptance). They run against TEST_DATABASE_URL and reset it first. Skipped when it is not set.
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "./pool";
import { loadMigrations, sha256, type MigrationFile } from "./migrations";
import { migrateDown, migrateUp, migrationStatus, MigrationDrift, resetForTests } from "./migrator";
import { executeIdempotent, IdempotencyConflict } from "./idempotency";
import { enqueueEvent, relayBatch, type OutboxRow } from "./outbox";
import { runBackfill, type BackfillJob } from "./backfill";
import { registerInvariant, runInvariants, snapshotTable } from "./integrity";
import { withTransaction } from "./transactions";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

describe.skipIf(!TEST_URL || !APP_URL)("database foundation", () => {
  let owner: Pool;
  let app: Pool;
  let migrations: MigrationFile[];

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-dbtest" });
    app = createPool(APP_URL!, { application_name: "erp-dbtest-app" });
    migrations = loadMigrations(dir);
    await resetForTests(owner);
    await migrateUp(owner, migrations);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  const fingerprint = async () =>
    (await owner.query<{ fp: string }>(
      `SELECT md5(
          COALESCE((SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable, '|' ORDER BY table_name, column_name)
                      FROM information_schema.columns WHERE table_schema = 'sys'), '') ||
          COALESCE((SELECT string_agg(p.proname, '|' ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'sys'), '')
        ) AS fp`,
    )).rows[0].fp;

  describe("migrations (REQ-DBF-F02)", () => {
    it("reports every committed migration as applied with a matching checksum", async () => {
      const status = await migrationStatus(owner, migrations);
      expect(status.every((s) => s.applied && s.checksumMatches)).toBe(true);
    });

    it("refuses to run when an applied migration's content has changed", async () => {
      const changed = migrations.map((m) => {
        const upSql = m.upSql + "\n-- edited";
        return { ...m, upSql, checksum: sha256(upSql) };
      });
      await expect(migrateUp(owner, changed)).rejects.toBeInstanceOf(MigrationDrift);
    });

    it("reverts the last migration and re-applies it with the same schema fingerprint", async () => {
      const before = await fingerprint();
      await migrateDown(owner, migrations, 1);
      expect((await migrationStatus(owner, migrations)).at(-1)?.applied).toBe(false);
      await migrateUp(owner, migrations);
      expect(await fingerprint()).toBe(before);
    });

    it("dry-run applies pending migrations in one transaction and changes nothing", async () => {
      const before = await fingerprint();
      await migrateUp(owner, migrations, { dryRun: true });
      expect(await fingerprint()).toBe(before);
    });
  });

  describe("roles and append-only tables (REQ-DBF-F15)", () => {
    it("the application role cannot create objects in the sys schema", async () => {
      const client = await app.connect();
      try {
        await expect(client.query("CREATE TABLE sys.should_fail (id int)")).rejects.toThrow(/permission denied/);
      } finally {
        client.release();
      }
    });

    it("an append-only table rejects UPDATE and DELETE for every role", async () => {
      await owner.query("INSERT INTO sys.integrity_snapshots (scope, table_name, row_count, checksum, trigger_name) VALUES ('t', 'x', 0, repeat('a', 64), 'test')");
      await expect(owner.query("UPDATE sys.integrity_snapshots SET row_count = 1")).rejects.toThrow(/append-only/);
      await expect(owner.query("DELETE FROM sys.integrity_snapshots")).rejects.toThrow(/append-only/);
    });
  });

  describe("tenant isolation (REQ-DBF-F09, ADR-002)", () => {
    const A = "00000000-0000-4000-8000-00000000000a";
    const B = "00000000-0000-4000-8000-00000000000b";

    beforeAll(async () => {
      await owner.query("CREATE TABLE dbf_rls_probe (id bigserial PRIMARY KEY, tenant_id uuid NOT NULL, note text NOT NULL)");
      await owner.query("SELECT sys.enable_tenant_rls('dbf_rls_probe'::regclass)");
      await owner.query("GRANT SELECT, INSERT ON dbf_rls_probe TO erp_app");
      await owner.query("GRANT USAGE ON SEQUENCE dbf_rls_probe_id_seq TO erp_app");
      await withTransaction(owner, (c) => c.query("INSERT INTO dbf_rls_probe (tenant_id, note) VALUES ($1, 'a1'), ($1, 'a2')", [A]), { tenantId: A });
      await withTransaction(owner, (c) => c.query("INSERT INTO dbf_rls_probe (tenant_id, note) VALUES ($1, 'b1')", [B]), { tenantId: B });
    });

    it("a tenant sees only its own rows", async () => {
      const count = await withTransaction(app, async (c) => Number((await c.query("SELECT count(*) AS n FROM dbf_rls_probe")).rows[0].n), { tenantId: A });
      expect(count).toBe(2);
    });

    it("without a tenant context no rows are visible", async () => {
      const count = await withTransaction(app, async (c) => Number((await c.query("SELECT count(*) AS n FROM dbf_rls_probe")).rows[0].n));
      expect(count).toBe(0);
    });

    it("a tenant cannot write a row for another tenant", async () => {
      await expect(
        withTransaction(app, (c) => c.query("INSERT INTO dbf_rls_probe (tenant_id, note) VALUES ($1, 'leak')", [B]), { tenantId: A, maxRetries: 0 }),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe("masking (REQ-DBF-F13)", () => {
    const withSalt = <T>(fn: (c: import("pg").PoolClient) => Promise<T>) =>
      withTransaction(owner, async (c) => {
        await c.query("SELECT set_config('sys.mask_salt', 'test-environment-salt', true)");
        return fn(c);
      });

    it("keeps the shape of a PAN and does not return the input", async () => {
      const masked = await withSalt(async (c) => (await c.query<{ m: string }>("SELECT sys.mask_pan('ABCDE1234F') AS m")).rows[0].m);
      expect(masked).toMatch(/^[A-Z]{5}[0-9]{4}[A-Z]$/);
      expect(masked).not.toBe("ABCDE1234F");
    });

    it("is deterministic within an environment", async () => {
      const row = await withSalt(async (c) => (await c.query<{ a: string; b: string }>("SELECT sys.mask_pan('ABCDE1234F') AS a, sys.mask_pan('ABCDE1234F') AS b")).rows[0]);
      expect(row.a).toBe(row.b);
    });

    it("keeps phone length and the country prefix, and replaces later digits", async () => {
      const masked = await withSalt(async (c) => (await c.query<{ m: string }>("SELECT sys.mask_phone('+91 98765 43210') AS m")).rows[0].m);
      expect(masked.slice(0, 2)).toBe("+9");
      expect(masked).toHaveLength("+91 98765 43210".length);
      expect(masked).not.toBe("+91 98765 43210");
    });

    it("keeps the email domain and the last four characters of an account number", async () => {
      const row = await withSalt(async (c) => (await c.query<{ e: string; a: string }>("SELECT sys.mask_email('ravi@example.com') AS e, sys.mask_account('123456789012') AS a")).rows[0]);
      expect(row.e.endsWith("@example.com")).toBe(true);
      expect(row.a).toBe("XXXXXXXX9012");
    });

    it("refuses to mask when no environment salt is set", async () => {
      await expect(withTransaction(owner, (c) => c.query("SELECT sys.mask_pan('ABCDE1234F')"))).rejects.toThrow(/mask_salt is not set/);
    });
  });

  describe("masked copy scanner (REQ-DBF-F13 acceptance)", () => {
    const SOURCE = [
      { id: 1, pan: "ABCDE1234F", phone: "+91 98765 43210", email: "ravi.kumar@example.com", account: "123456789012" },
      { id: 2, pan: "QWERT9876Y", phone: "+91 91234 56789", email: "meena.iyer@example.com", account: "987654321098" },
    ];

    it("a masked copy contains none of the source values", async () => {
      await owner.query("CREATE TABLE dbf_pii_source (id int PRIMARY KEY, pan text, phone text, email text, account text)");
      for (const r of SOURCE) {
        await owner.query("INSERT INTO dbf_pii_source VALUES ($1, $2, $3, $4, $5)", [r.id, r.pan, r.phone, r.email, r.account]);
      }
      await withTransaction(owner, async (c) => {
        await c.query("SELECT set_config('sys.mask_salt', 'test-environment-salt', true)");
        await c.query(`CREATE TABLE dbf_pii_masked AS
          SELECT id, sys.mask_pan(pan) AS pan, sys.mask_phone(phone) AS phone, sys.mask_email(email) AS email, sys.mask_account(account) AS account
            FROM dbf_pii_source`);
      });
      const masked = (await owner.query<{ text: string }>("SELECT t::text AS text FROM dbf_pii_masked AS t")).rows.map((r) => r.text).join("\n");
      for (const r of SOURCE) {
        for (const value of [r.pan, r.phone, r.email, r.account]) expect(masked.includes(value), value).toBe(false);
      }
    });
  });

  describe("partitions and effective dating (REQ-DBF-F07, F08)", () => {
    it("creates monthly partitions ahead and is idempotent", async () => {
      await owner.query("CREATE TABLE dbf_events_probe (id bigint NOT NULL, at timestamptz NOT NULL) PARTITION BY RANGE (at)");
      const first = await owner.query<{ n: number }>("SELECT sys.create_monthly_partitions('dbf_events_probe'::regclass, 2) AS n");
      expect(first.rows[0].n).toBe(3);
      const second = await owner.query<{ n: number }>("SELECT sys.create_monthly_partitions('dbf_events_probe'::regclass, 2) AS n");
      expect(second.rows[0].n).toBe(0);
    });

    it("is_effective treats an open end as still effective", async () => {
      const r = await owner.query<{ a: boolean; b: boolean; c: boolean }>(
        `SELECT sys.is_effective('2026-01-01', NULL, '2027-01-01') AS a,
                sys.is_effective('2026-01-01', '2026-06-01', '2026-06-01') AS b,
                sys.is_effective('2026-01-01', '2026-06-01', '2026-03-01') AS c`,
      );
      expect(r.rows[0]).toEqual({ a: true, b: false, c: true });
    });
  });

  describe("idempotency (REQ-DBF-F06, AC-4)", () => {
    const scope = () => `test.scope.${Math.random().toString(36).slice(2)}`;
    const key = "key-0000000001";

    it("replays the stored response for the same key and body without running the handler again", async () => {
      const s = scope();
      let runs = 0;
      const handler = async () => ({ id: ++runs });
      const first = await executeIdempotent(owner, { scope: s, key, body: { amount: 10 } }, handler);
      const second = await executeIdempotent(owner, { scope: s, key, body: { amount: 10 } }, handler);
      expect(first).toEqual({ replayed: false, response: { id: 1 } });
      expect(second).toEqual({ replayed: true, response: { id: 1 } });
      expect(runs).toBe(1);
    });

    it("rejects a reused key with a different body", async () => {
      const s = scope();
      await executeIdempotent(owner, { scope: s, key, body: { amount: 10 } }, async () => "ok");
      await expect(executeIdempotent(owner, { scope: s, key, body: { amount: 11 } }, async () => "ok")).rejects.toBeInstanceOf(IdempotencyConflict);
    });

    it("runs the handler exactly once for concurrent duplicates", async () => {
      const s = scope();
      let runs = 0;
      const handler = async () => {
        runs += 1;
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true };
      };
      const results = await Promise.all(Array.from({ length: 5 }, () => executeIdempotent(owner, { scope: s, key, body: { x: 1 } }, handler)));
      expect(runs).toBe(1);
      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    });

    it("lets the client retry after a failed handler, because the key is removed", async () => {
      const s = scope();
      await expect(executeIdempotent(owner, { scope: s, key, body: {} }, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
      const retry = await executeIdempotent(owner, { scope: s, key, body: {} }, async () => "fine");
      expect(retry).toEqual({ replayed: false, response: "fine" });
    });
  });

  describe("outbox (REQ-DBF-F06, AC-5)", () => {
    it("writes events in the business transaction, relays them once, and never re-publishes", async () => {
      await withTransaction(owner, async (c) => {
        await enqueueEvent(c, { eventType: "dbf.test.recorded", payload: { n: 1 } });
        await enqueueEvent(c, { eventType: "dbf.test.recorded", payload: { n: 2 } });
      });
      const seen: OutboxRow[] = [];
      const published = await relayBatch(owner, async (rows) => { seen.push(...rows); }, 100);
      expect(published).toBeGreaterThanOrEqual(2);
      const again = await relayBatch(owner, async () => undefined, 100);
      expect(again).toBe(0);
    });

    it("counts a failed publish and keeps the event unpublished", async () => {
      await withTransaction(owner, (c) => enqueueEvent(c, { eventType: "dbf.test.failing", payload: {} }));
      await expect(relayBatch(owner, async () => { throw new Error("bus down"); }, 1000)).rejects.toThrow("bus down");
      const row = (await owner.query<{ attempts: number; published_at: Date | null }>(
        "SELECT attempts, published_at FROM sys.outbox WHERE event_type = 'dbf.test.failing'",
      )).rows[0];
      expect(row.published_at).toBeNull();
      expect(row.attempts).toBeGreaterThanOrEqual(1);
    });

    it("rejects an event type outside the convention", async () => {
      await expect(withTransaction(owner, (c) => enqueueEvent(c, { eventType: "Bad Name", payload: {} }))).rejects.toThrow(RangeError);
    });
  });

  describe("back-fill (REQ-DBF-F03)", () => {
    const ROWS = 20_000;
    const BATCH = 4_000;

    beforeAll(async () => {
      await owner.query("CREATE TABLE dbf_bf_source (id bigint PRIMARY KEY, amount_paise bigint NOT NULL)");
      await owner.query("CREATE TABLE dbf_bf_target (id bigint PRIMARY KEY, amount_paise bigint NOT NULL)");
      await owner.query(`INSERT INTO dbf_bf_source SELECT g, (g * 37) % 100000 FROM generate_series(1, ${ROWS}) g`);
    });

    const rangeChecksum = async (c: import("pg").PoolClient | Pool, table: string, from: number, to: number) =>
      (await c.query<{ sum: string; n: string }>(
        `SELECT COALESCE(sum(amount_paise), 0)::text AS sum, count(*)::text AS n FROM ${table} WHERE id BETWEEN $1 AND $2`,
        [from, to],
      )).rows[0];

    const copyJob: BackfillJob = {
      jobCode: "dbf_test_copy",
      moduleCode: "dbf",
      minKey: 1,
      maxKey: ROWS,
      batchSize: BATCH,
      async batch(client, from, to) {
        const copied = await client.query("INSERT INTO dbf_bf_target SELECT * FROM dbf_bf_source WHERE id BETWEEN $1 AND $2", [from, to]);
        const src = await rangeChecksum(client, "dbf_bf_source", from, to);
        const dst = await rangeChecksum(client, "dbf_bf_target", from, to);
        const digest = (r: { sum: string; n: string }) => `${r.n}:${r.sum}`;
        return { read: Number(src.n), written: copied.rowCount ?? 0, sourceChecksum: digest(src), targetChecksum: digest(dst) };
      },
    };

    it("stops after a set number of batches and resumes exactly where it stopped", async () => {
      const first = await runBackfill(owner, copyJob, { maxBatches: 2 });
      expect(first).toMatchObject({ batchesReconciled: 2, stoppedBy: "max_batches", completed: false });
      const second = await runBackfill(owner, copyJob);
      expect(second).toMatchObject({ completed: true, stoppedBy: "completed" });
      expect(second.batchesReconciled).toBe(Math.ceil(ROWS / BATCH) - 2);
    });

    it("reconciles the whole table exactly after resuming", async () => {
      const src = await rangeChecksum(owner, "dbf_bf_source", 1, ROWS);
      const dst = await rangeChecksum(owner, "dbf_bf_target", 1, ROWS);
      expect(dst).toEqual(src);
      const batches = await owner.query<{ n: string }>("SELECT count(*)::text AS n FROM sys.backfill_batches WHERE job_code = 'dbf_test_copy' AND status = 'reconciled'");
      expect(Number(batches.rows[0].n)).toBe(Math.ceil(ROWS / BATCH));
    });

    it("honours the kill switch before the next batch", async () => {
      const stopped = await runBackfill(owner, { ...copyJob, jobCode: "dbf_test_kill" }, { shouldStop: () => true });
      expect(stopped).toMatchObject({ stoppedBy: "stop_requested", batchesReconciled: 0 });
    });

    it("rolls back a batch whose checksums differ and records nothing for it", async () => {
      // The broken job writes a row and then reports different checksums; the runner must roll that write back.
      const broken: BackfillJob = { ...copyJob, jobCode: "dbf_test_mismatch", batch: async (client, from) => {
        await client.query("UPDATE dbf_bf_target SET amount_paise = amount_paise + 1 WHERE id = $1", [from]);
        return { read: 1, written: 1, sourceChecksum: "a", targetChecksum: "b" };
      } };
      const result = await runBackfill(owner, broken, { maxBatches: 5 });
      expect(result.stoppedBy).toBe("checksum_mismatch");
      const recorded = await owner.query<{ n: string }>("SELECT count(*)::text AS n FROM sys.backfill_batches WHERE job_code = 'dbf_test_mismatch'");
      expect(recorded.rows[0].n).toBe("0");
    });
  });

  describe("integrity (REQ-DBF-F05)", () => {
    beforeAll(async () => {
      await owner.query("CREATE TABLE dbf_ledger (voucher text NOT NULL, dr bigint NOT NULL, cr bigint NOT NULL)");
      await registerInvariant(owner, {
        code: "dbf_vouchers_balance",
        moduleCode: "dbf",
        description: "Debits equal credits for every voucher (Part 00 §7.6)",
        severity: "critical",
        sql: "SELECT voucher AS key_ref, format('debits %s credits %s', sum(dr), sum(cr)) AS detail FROM dbf_ledger GROUP BY voucher HAVING sum(dr) <> sum(cr)",
      });
    });

    it("records a violation once and never resolves it automatically", async () => {
      await owner.query("INSERT INTO dbf_ledger VALUES ('V-1', 100, 90)");
      const first = await runInvariants(owner);
      expect(first.violationsFound).toBeGreaterThanOrEqual(1);
      const again = await runInvariants(owner);
      expect(again.newFindings).toBe(0);
      await owner.query("UPDATE dbf_ledger SET cr = 100 WHERE voucher = 'V-1'");
      await runInvariants(owner);
      const open = await owner.query<{ n: string }>("SELECT count(*)::text AS n FROM sys.integrity_findings WHERE key_ref = 'V-1' AND status = 'open'");
      expect(open.rows[0].n).toBe("1");
    });

    it("snapshots change when the table changes", async () => {
      const before = await snapshotTable(owner, "dbf_ledger", "voucher");
      await owner.query("INSERT INTO dbf_ledger VALUES ('V-2', 5, 5)");
      const after = await snapshotTable(owner, "dbf_ledger", "voucher");
      expect(after.rowCount).toBe(before.rowCount + 1);
      expect(after.checksum).not.toBe(before.checksum);
    });
  });
});
