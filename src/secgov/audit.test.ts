// Pure audit rules (Part 08 S1).
import { describe, expect, it } from "vitest";
import { GENESIS_HASH, maskAccount, moduleOf, rowHash, REASON_REQUIRED } from "./audit";

const base = {
  seq: 1, occurredAt: new Date("2026-10-20T10:00:00.000Z"), actorRef: "u1", impersonatedBy: null, sessionId: null, correlationId: "c1",
  causationId: null, module: "procurement", entityType: "po", entityId: "PO-1", action: "procurement.po.created", before: null,
  after: { amount: 100 }, changedFields: [], reasonCode: null, reason: null, prevHash: GENESIS_HASH,
};

describe("audit hash (REQ-SECGOV-F02)", () => {
  it("is stable for the same row and changes when any stored byte changes", () => {
    const h = rowHash("t1", base);
    expect(rowHash("t1", { ...base })).toBe(h);
    expect(rowHash("t1", { ...base, after: { amount: 101 } })).not.toBe(h);
    expect(rowHash("t1", { ...base, actorRef: "u2" })).not.toBe(h);
    expect(rowHash("t2", base)).not.toBe(h);
    expect(rowHash("t1", { ...base, prevHash: "1".repeat(64) })).not.toBe(h);
  });

  it("takes the module from the first segment of the action", () => {
    expect(moduleOf("procurement.po.created")).toBe("procurement");
    expect(moduleOf("setting.changed")).toBe("setting");
  });

  it("lists the actions that need a reason", () => {
    expect(REASON_REQUIRED.has("document.rejected")).toBe(true);
    expect(REASON_REQUIRED.has("procurement.po.created")).toBe(false);
  });
});

describe("masking (REQ-SECGOV-F05; policy §6)", () => {
  it("keeps only the last four digits and a short hash, never the whole number", () => {
    const masked = maskAccount("123456789012");
    expect(masked.startsWith("********9012 #")).toBe(true);
    expect(masked).not.toContain("12345678");
    expect(maskAccount("1234 5678 9012")).toBe(masked);
  });
});
