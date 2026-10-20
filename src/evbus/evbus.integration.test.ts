// Part 10 S1 database tests: rollback publishes nothing, delivery is once, redelivery has no second effect, a failed handler is
// retried and then applied once, system events are counted, and sensitive values are refused before they are stored.
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { Subscriptions, postgresBroker } from "./broker";
import { relayOnce } from "./relay";
import type { Envelope } from "./envelope";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

function contextFor(tenantId: string): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId: randomUUID(), roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomBytes(4).toString("hex")}`,
  );
}

describe.skipIf(!TEST_URL || !APP_URL)("event bus foundation (Part 10 S1)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-evbustest" });
    app = createPool(APP_URL!, { application_name: "erp-evbustest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  async function outboxRows(eventType: string): Promise<{ published_at: Date | null; attempts: number; aggregate_key: string | null; correlation_id: string | null }[]> {
    const { rows } = await owner.query("SELECT published_at, attempts, aggregate_key, correlation_id FROM sys.outbox WHERE event_type = $1 ORDER BY id", [eventType]);
    return rows;
  }

  async function inboxCount(tenantId: string, consumer: string, eventId: string): Promise<number> {
    return withTransaction(app, async (client) => {
      const { rows } = await client.query<{ n: string }>("SELECT count(*) AS n FROM evt_inbox WHERE consumer = $1 AND event_id = $2", [consumer, eventId]);
      return Number(rows[0].n);
    }, { tenantId });
  }

  it("publishes nothing when the business change rolls back", async () => {
    const ctx = contextFor(randomUUID());
    await expect(
      runUnitOfWork(app, ctx, async (uow) => {
        await uow.emit({ eventType: "evbus.test.rolled_back", payload: { documentNo: "PO-1" } });
        throw new Error("business rule failed after the event was written");
      }),
    ).rejects.toThrow("business rule failed");
    expect(await outboxRows("evbus.test.rolled_back")).toEqual([]);
  });

  it("refuses an event that carries a sensitive value, so the business change does not commit", async () => {
    const ctx = contextFor(randomUUID());
    await expect(
      runUnitOfWork(app, ctx, async (uow) => {
        await uow.emit({ eventType: "evbus.test.sensitive", payload: { vendor: { bankAccount: "123456789012" } } });
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await outboxRows("evbus.test.sensitive")).toEqual([]);
  });

  it("delivers a committed event once, with its envelope, and a redelivery has no second effect", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    await runUnitOfWork(app, ctx, async (uow) => {
      await uow.emit({ eventType: "proc.po.approved", payload: { poNumber: "PO-7", amountPaise: 90000 }, aggregateKey: "po-7" });
    });
    const received: Envelope[] = [];
    const subs = new Subscriptions();
    subs.subscribe({ consumer: "evbus_once", eventTypes: ["proc.po.approved"], handler: async (_client, env) => { if (env.tenantId === tenant) received.push(env); } });
    await relayOnce(app, postgresBroker(app, subs));

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ eventType: "proc.po.approved", tenantId: tenant, aggregateKey: "po-7", correlationId: ctx.correlationId, payload: { poNumber: "PO-7", amountPaise: 90000 } });
    expect(await inboxCount(tenant, "evbus_once", received[0].eventId)).toBe(1);

    await postgresBroker(app, subs).publish([received[0]]);
    expect(received).toHaveLength(1);
    expect((await outboxRows("proc.po.approved")).every((r) => r.published_at !== null)).toBe(true);
  });

  it("retries a failed handler without losing the event, then applies it once", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    await runUnitOfWork(app, ctx, async (uow) => {
      await uow.emit({ eventType: "stores.grn.posted", payload: { grnNo: "GRN-3" } });
    });
    let attempts = 0;
    const effects: string[] = [];
    const subs = new Subscriptions();
    subs.subscribe({
      consumer: "evbus_retry",
      eventTypes: ["stores.grn.posted"],
      handler: async (_client, env) => {
        if (env.tenantId !== tenant) return;
        attempts++;
        if (attempts === 1) throw new Error("accrual store unavailable");
        effects.push(env.eventId);
      },
    });
    await expect(relayOnce(app, postgresBroker(app, subs))).rejects.toThrow("accrual store unavailable");
    const pending = await outboxRows("stores.grn.posted");
    expect(pending[0].published_at).toBeNull();
    expect(pending[0].attempts).toBeGreaterThanOrEqual(1);

    await relayOnce(app, postgresBroker(app, subs));
    expect(effects).toHaveLength(1);
    expect(await outboxRows("stores.grn.posted")).toMatchObject([{ published_at: expect.any(Date) }]);
  });

  it("counts an event with no tenant and delivers it to no consumer", async () => {
    await owner.query("INSERT INTO sys.outbox (event_type, payload) VALUES ('evbus.test.system', '{}')");
    const subs = new Subscriptions();
    let called = false;
    subs.subscribe({ consumer: "evbus_system", eventTypes: ["evbus.test.system"], handler: async () => { called = true; } });
    await relayOnce(app, postgresBroker(app, subs));
    expect(called).toBe(false);
    expect((await outboxRows("evbus.test.system"))[0].published_at).not.toBeNull();
  });
});
