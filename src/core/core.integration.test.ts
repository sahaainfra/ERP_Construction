// Shared kernel acceptance tests (Part 05 §16). Run against TEST_DATABASE_URL and TEST_APP_DATABASE_URL; skipped without them.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "./context";
import { AppError } from "./errors";
import { idempotent } from "./idempotency";
import { claimJobs, completeJob, enqueueJob, failJob } from "./jobs";
import { allocateNumber, createSeries, previewNext, voidNumber } from "./numbering";
import { resolveSetting, setSetting } from "./settings";
import { runUnitOfWork } from "./uow";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

function contextFor(tenantId: string, userId = randomUUID(), roles = ["admin"]): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles, permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

describe.skipIf(!TEST_URL || !APP_URL)("shared kernel (Part 05)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-coretest" });
    app = createPool(APP_URL!, { application_name: "erp-coretest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** Counts rows for one tenant inside a tenant-scoped transaction, so row-level security is exercised as the application. */
  const count = (tenantId: string, table: string, where = "TRUE", params: unknown[] = []) =>
    withTransaction(
      app,
      async (client) => Number((await client.query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, params)).rows[0].n),
      { tenantId },
    ).then((n) => (where === "TRUE" ? n : n));

  describe("unit of work (REQ-CORE-F03, CP-CORE-01/02)", () => {
    it("commits audit, ledger, evaluation and outbox rows together", async () => {
      const ctx = contextFor(randomUUID());
      await runUnitOfWork(app, ctx, async (uow) => {
        await uow.audit({ action: "sample.created", entityType: "sample", entityId: "1" });
        await uow.ledger({ action: "CREATED", entityType: "sample", entityId: "1" });
        await uow.evaluate({ cpCode: "CP-CORE-01", result: "PASS" });
        await uow.emit({ eventType: "core.sample.created", payload: { id: 1 } });
      });
      expect(await count(ctx.tenantId, "core_audit_entries", "correlation_id = $1", [ctx.correlationId])).toBe(1);
      expect(await count(ctx.tenantId, "core_action_ledger", "correlation_id = $1", [ctx.correlationId])).toBe(1);
      expect(await count(ctx.tenantId, "core_protocol_evaluations", "correlation_id = $1", [ctx.correlationId])).toBe(1);
      expect(await count(ctx.tenantId, "sys.outbox", "tenant_id = $1", [ctx.tenantId])).toBe(1);
    });

    it("leaves none of the four rows when a failure follows the business write", async () => {
      const ctx = contextFor(randomUUID());
      await expect(
        runUnitOfWork(app, ctx, async (uow) => {
          await uow.client.query("INSERT INTO core_sample_records (tenant_id, title, amount_paise) VALUES ($1, 'Rollback check', 100)", [ctx.tenantId]);
          await uow.audit({ action: "sample.created", entityType: "sample", entityId: "x" });
          await uow.ledger({ action: "CREATED", entityType: "sample", entityId: "x" });
          await uow.evaluate({ cpCode: "CP-CORE-01", result: "PASS" });
          await uow.emit({ eventType: "core.sample.created", payload: {} });
          throw new Error("forced failure after the business write");
        }),
      ).rejects.toThrow("forced failure");
      expect(await count(ctx.tenantId, "core_sample_records", "title = 'Rollback check'")).toBe(0);
      expect(await count(ctx.tenantId, "core_audit_entries", "correlation_id = $1", [ctx.correlationId])).toBe(0);
      expect(await count(ctx.tenantId, "core_action_ledger", "correlation_id = $1", [ctx.correlationId])).toBe(0);
      expect(await count(ctx.tenantId, "core_protocol_evaluations", "correlation_id = $1", [ctx.correlationId])).toBe(0);
      expect(await count(ctx.tenantId, "sys.outbox", "tenant_id = $1", [ctx.tenantId])).toBe(0);
    });

    it("rejects an event type that does not follow the naming rule", async () => {
      const ctx = contextFor(randomUUID());
      await expect(runUnitOfWork(app, ctx, (uow) => uow.emit({ eventType: "BadName", payload: {} }))).rejects.toThrow(RangeError);
    });
  });

  describe("numbering (REQ-CORE-F09; AC-6)", () => {
    it("allocates 100 parallel numbers with no duplicates and no gaps", async () => {
      const ctx = contextFor(randomUUID());
      await createSeries(app, ctx, { code: "INV", template: "INV/{SEQ:5}" });
      const results = await Promise.all(
        Array.from({ length: 100 }, (_, i) => runUnitOfWork(app, ctx, (uow) => allocateNumber(uow.client, ctx, "INV", `doc-${i}`))),
      );
      const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
      expect(new Set(seqs).size).toBe(100);
      expect(seqs[0]).toBe(1);
      expect(seqs[99]).toBe(100);
      expect(results.find((r) => r.seq === 1)?.formatted).toBe("INV/00001");
    });

    it("returns a rolled-back number to the counter so the series stays gap-free", async () => {
      const ctx = contextFor(randomUUID());
      await createSeries(app, ctx, { code: "GAP", template: "GAP/{SEQ}" });
      await expect(
        runUnitOfWork(app, ctx, async (uow) => {
          await allocateNumber(uow.client, ctx, "GAP", "failed");
          throw new Error("forced");
        }),
      ).rejects.toThrow("forced");
      const next = await runUnitOfWork(app, ctx, (uow) => allocateNumber(uow.client, ctx, "GAP", "kept"));
      expect(next.seq).toBe(1);
    });

    it("voids a number and keeps it on record with the reason", async () => {
      const ctx = contextFor(randomUUID());
      await createSeries(app, ctx, { code: "VOID", template: "VOID/{SEQ}" });
      const allocation = await runUnitOfWork(app, ctx, (uow) => allocateNumber(uow.client, ctx, "VOID", "doc-1"));
      await voidNumber(app, ctx.tenantId ? (ctx as RequestContext) : ctx, "VOID", allocation.seq, "Entered in error by the data-entry clerk");
      const row = await withTransaction(
        app,
        (c) => c.query<{ status: string; void_reason: string }>("SELECT status, void_reason FROM core_number_allocations WHERE series_code = 'VOID' AND seq = 1"),
        { tenantId: ctx.tenantId },
      );
      expect(row.rows[0]).toEqual({ status: "voided", void_reason: "Entered in error by the data-entry clerk" });
      await expect(voidNumber(app, ctx, "VOID", allocation.seq, "Entered in error by the data-entry clerk")).rejects.toBeInstanceOf(AppError);
    });

    it("previews the next number without allocating it", async () => {
      const ctx = contextFor(randomUUID());
      await createSeries(app, ctx, { code: "PRV", template: "PRV/{SEQ:3}" });
      expect(await previewNext(app, ctx, "PRV")).toBe("PRV/001");
      expect(await previewNext(app, ctx, "PRV")).toBe("PRV/001");
    });

    it("keeps one tenant's series invisible to another tenant", async () => {
      const a = contextFor(randomUUID());
      const b = contextFor(randomUUID());
      await createSeries(app, a, { code: "ISO", template: "ISO/{SEQ}" });
      await expect(previewNext(app, b, "ISO")).rejects.toMatchObject({ code: "NUMBER_SERIES_UNKNOWN" });
    });
  });

  describe("configuration hierarchy (REQ-CORE-F07; CP-CORE-03)", () => {
    it("refuses a business-impacting change without a second approver", async () => {
      const ctx = contextFor(randomUUID());
      await expect(
        setSetting(app, ctx, { key: "core.fiscal.start_month", scopeType: "company", scopeId: "c1", value: 4, reason: "Move the financial year start" }),
      ).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    });

    it("refuses an approver who is the requester", async () => {
      const ctx = contextFor(randomUUID());
      await expect(
        setSetting(app, ctx, { key: "core.fiscal.start_month", scopeType: "company", scopeId: "c1", value: 4, reason: "Move the financial year start", approvedBy: ctx.userId }),
      ).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
    });

    it("resolves the most specific scope and falls back to the registry default", async () => {
      const ctx = contextFor(randomUUID());
      const approver = randomUUID();
      const scopes = [
        { type: "tenant" as const, id: ctx.tenantId },
        { type: "company" as const, id: "c1" },
        { type: "project" as const, id: "p1" },
      ];
      expect((await resolveSetting(app, ctx, "core.locale.default", scopes)).source).toBe("default");
      await setSetting(app, ctx, { key: "core.locale.default", scopeType: "tenant", scopeId: ctx.tenantId, value: "hi-IN", reason: "Tenant prefers Hindi" });
      await setSetting(app, ctx, { key: "core.locale.default", scopeType: "project", scopeId: "p1", value: "en-IN", reason: "Project site uses English" });
      expect(await resolveSetting(app, ctx, "core.locale.default", scopes)).toEqual({ value: "en-IN", source: "project:p1" });
      expect(await resolveSetting(app, ctx, "core.locale.default", [{ type: "tenant", id: ctx.tenantId }])).toEqual({ value: "hi-IN", source: `tenant:${ctx.tenantId}` });
      await setSetting(app, ctx, { key: "core.fiscal.start_month", scopeType: "company", scopeId: "c1", value: 4, reason: "Confirm FY start", approvedBy: approver });
      expect((await resolveSetting(app, ctx, "core.fiscal.start_month", [{ type: "company", id: "c1" }])).value).toBe(4);
    });

    it("rejects a value outside the registry's allowed set", async () => {
      const ctx = contextFor(randomUUID());
      await expect(
        setSetting(app, ctx, { key: "core.locale.default", scopeType: "tenant", scopeId: ctx.tenantId, value: "fr-FR", reason: "Try an unsupported locale" }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });
  });

  describe("idempotency (REQ-CORE-F04)", () => {
    it("replays the original response for the same key and body, and refuses a different body with 422", async () => {
      const ctx = contextFor(randomUUID());
      const key = `key-${randomUUID()}`;
      let runs = 0;
      const first = await idempotent(app, ctx, key, { amount: 10 }, async () => ({ id: ++runs }));
      const replay = await idempotent(app, ctx, key, { amount: 10 }, async () => ({ id: ++runs }));
      expect(first.response).toEqual({ id: 1 });
      expect(replay.response).toEqual({ id: 1 });
      expect(runs).toBe(1);
      await expect(idempotent(app, ctx, key, { amount: 99 }, async () => ({ id: 3 }))).rejects.toMatchObject({ code: "IDEMPOTENCY_PAYLOAD_MISMATCH", status: 422 });
    });
  });

  describe("job queue (REQ-CORE-F14)", () => {
    it("enqueues once per idempotency key", async () => {
      const tenant = randomUUID();
      const key = `job-${randomUUID()}`;
      expect(await enqueueJob(app, tenant, { type: "core.sample.run", idempotencyKey: key })).not.toBeNull();
      expect(await enqueueJob(app, tenant, { type: "core.sample.run", idempotencyKey: key })).toBeNull();
    });

    it("gives two concurrent claims disjoint jobs", async () => {
      const tenant = randomUUID();
      for (let i = 0; i < 6; i++) await enqueueJob(app, tenant, { type: "core.sample.run", idempotencyKey: `claim-${i}-${randomUUID()}` });
      const [a, b] = await Promise.all([claimJobs(app, tenant, 4), claimJobs(app, tenant, 4)]);
      const ids = [...a, ...b].map((j) => j.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(6);
      for (const job of a) await completeJob(app, tenant, job.id);
    });

    it("retries a failed job and marks it dead after its maximum attempts", async () => {
      const tenant = randomUUID();
      await enqueueJob(app, tenant, { type: "core.sample.run", idempotencyKey: `dead-${randomUUID()}`, maxAttempts: 2 });
      const [first] = await claimJobs(app, tenant);
      expect(await failJob(app, tenant, first, "boom")).toBe("retry");
      // The retry waits for its backoff, so the record is made runnable again here for the second attempt.
      await withTransaction(app, (c) => c.query("UPDATE core_jobs SET run_after = now() WHERE status = 'queued'"), { tenantId: tenant });
      const [second] = await claimJobs(app, tenant);
      expect(second.attempts).toBe(2);
      expect(await failJob(app, tenant, second, "boom again")).toBe("dead");
      const status = await withTransaction(app, (c) => c.query<{ status: string }>("SELECT status FROM core_jobs WHERE id = $1", [second.id]), { tenantId: tenant });
      expect(status.rows[0].status).toBe("dead");
    });
  });

  describe("scope and tenancy (REQ-CORE-F01)", () => {
    it("refuses a client-sent active project that the session does not hold", () => {
      const tenant = randomUUID();
      expect(() =>
        buildContext(
          { tenantId: tenant, companyId: randomUUID(), projectIds: [randomUUID()], siteIds: [], userId: randomUUID(), roles: ["planner"], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
          "web",
          "corr-1",
          null,
          randomUUID(),
        ),
      ).toThrow(RangeError);
    });
  });
});
