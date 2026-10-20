// Part 10 S1 pure tests: envelope, subscriptions, sensitive-value refusal at enqueue, and the static rule CP-EVBUS-01 (events only
// through the outbox, inside the business transaction). Database tests are in evbus.integration.test.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { sensitivePaths } from "../core/logger";
import { envelopeOf } from "./envelope";
import { Subscriptions } from "./broker";
import type { OutboxRow } from "../db/outbox";

const ROW: OutboxRow = {
  id: 7,
  eventId: "0b0d7c1e-6f5a-4a3e-9d55-2f7e1c9a7b10",
  eventType: "proc.po.approved",
  schemaVersion: 1,
  tenantId: "11111111-1111-4111-8111-111111111111",
  payload: { poNumber: "PO-0042", amountPaise: 125000 },
  attempts: 0,
  aggregateKey: null,
  correlationId: "corr-9",
  causationId: null,
  createdAt: new Date("2026-10-20T10:00:00.000Z"),
};

describe("envelope (REQ-EVBUS-F01, A-48)", () => {
  it("is built from the committed row, with the event id as the idempotency key and aggregate defaults", () => {
    expect(envelopeOf(ROW)).toEqual({
      eventId: ROW.eventId,
      eventType: "proc.po.approved",
      schemaVersion: 1,
      tenantId: ROW.tenantId,
      occurredAt: "2026-10-20T10:00:00.000Z",
      aggregateKey: ROW.eventId,
      idempotencyKey: ROW.eventId,
      causationId: null,
      correlationId: "corr-9",
      payload: ROW.payload,
    });
  });

  it("uses the stored aggregate key for ordering when one was given", () => {
    expect(envelopeOf({ ...ROW, aggregateKey: "po-0042" }).aggregateKey).toBe("po-0042");
  });
});

describe("sensitive values in events", () => {
  it("finds sensitive keys at any depth, and leaves ordinary keys such as companyId alone", () => {
    expect(sensitivePaths({ companyId: "C1", detail: { passwordHash: "x", items: [{ apiKey: "k" }] }, bankAccount: "1234" })).toEqual(["detail.passwordHash", "detail.items[0].apiKey", "bankAccount"]);
    expect(sensitivePaths({ companyId: "C1", spanDays: 3, expandedRows: 4 })).toEqual([]);
  });
});

describe("subscriptions (REQ-EVBUS-F04)", () => {
  it("refuses a duplicate consumer, a bad name and a consumer with no event types", () => {
    const subs = new Subscriptions();
    const handler = async () => undefined;
    subs.subscribe({ consumer: "stores_accrual", eventTypes: ["stores.grn.posted"], handler });
    expect(() => subs.subscribe({ consumer: "stores_accrual", eventTypes: ["stores.grn.posted"], handler })).toThrow("already subscribed");
    expect(() => subs.subscribe({ consumer: "Bad-Name", eventTypes: ["a.b.c"], handler })).toThrow(RangeError);
    expect(() => subs.subscribe({ consumer: "empty_one", eventTypes: [], handler })).toThrow(RangeError);
    expect(subs.forEventType("stores.grn.posted").map((s) => s.consumer)).toEqual(["stores_accrual"]);
    expect(subs.forEventType("stores.issue.posted")).toEqual([]);
  });
});

describe("CP-EVBUS-01: events are written only through the outbox inside the business transaction", () => {
  const SRC = join(__dirname, "..");
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }
  const files = sourceFiles(SRC).map((path) => ({ rel: relative(SRC, path).replace(/\\/g, "/"), text: readFileSync(path, "utf8") }));

  it("no code outside the outbox module writes to sys.outbox", () => {
    const offenders = files.filter((f) => f.rel !== "db/outbox.ts" && /sys\.outbox/.test(f.text)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("enqueueEvent is called only from the outbox module and the unit of work", () => {
    const callers = files.filter((f) => /enqueueEvent\(/.test(f.text) && f.rel !== "db/outbox.ts").map((f) => f.rel);
    expect(callers).toEqual(["core/uow.ts"]);
  });
});
