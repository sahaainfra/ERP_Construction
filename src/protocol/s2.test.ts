// Part 17 S2 pure tests: the approval band (Part 00 §9.3 seed), the narrative minimums, consumption caps and validity, the emergency window
// (A-161), evidence minimums (§9.5), the most-specific threshold (§9.4), and the body checks for configuration.
import { describe, expect, it } from "vitest";
import { configBody } from "./exception-store";
import { consumable, emergencyDue, emergencyState, evidenceMissing, matrixBand, narrativeProblem, thresholdAt, type ThresholdRow } from "./exceptions";

describe("approval band (Part 00 §9.3 seed)", () => {
  it("routes up to 5 % to the PM, 5 to 10 % to the PM and Cost Controller, and above 10 % or 5 lakh to management", () => {
    expect(matrixBand(4, 1_000_000)).toBe("PM");
    expect(matrixBand(7, 1_000_000)).toBe("PM_COST");
    expect(matrixBand(11, 1_000_000)).toBe("MANAGEMENT");
    expect(matrixBand(2, 50_000_100)).toBe("MANAGEMENT");
  });
});

describe("narrative (Part 00 §9.3)", () => {
  it("needs 20 characters, and 50 for Other", () => {
    expect(narrativeProblem("MATERIAL_SHORT", "Short text")).toMatch(/at least 20/);
    expect(narrativeProblem("MATERIAL_SHORT", "Concrete mix changed after the pour order was placed")).toBeNull();
    expect(narrativeProblem("OTHER", "Too short for other reasons here")).toMatch(/at least 50 characters for Other/);
  });
});

describe("consumption (REQ-PROTOCOL-F05)", () => {
  const approved = { status: "APPROVED", validity: "SINGLE_USE" as const, cap: 0.8, consumed: 0, validUntil: null };
  it("uses an approved single-use exception once, then refuses the second use", () => {
    const first = consumable(approved, 0.8, "2026-10-21");
    expect(first).toEqual({ ok: true, consumed: 0.8, status: "CONSUMED" });
    expect(consumable({ ...approved, consumed: 0.8, status: "CONSUMED" }, 0.1, "2026-10-21")).toMatchObject({ ok: false, reason: expect.stringContaining("already") });
  });
  it("refuses more than the cap, an expired exception, and one not yet approved", () => {
    expect(consumable(approved, 0.9, "2026-10-21")).toMatchObject({ ok: false, reason: expect.stringContaining("covers 0.8") });
    expect(consumable({ ...approved, validity: "UNTIL_DATE", validUntil: "2026-10-20" }, 0.1, "2026-10-21")).toMatchObject({ ok: false, reason: "the exception has expired" });
    expect(consumable({ ...approved, status: "IN_APPROVAL" }, 0.1, "2026-10-21")).toMatchObject({ ok: false });
  });
  it("draws a quantity cap down cumulatively and stops at the cap", () => {
    const cap = { status: "APPROVED", validity: "QUANTITY_CAP" as const, cap: 10, consumed: 7, validUntil: null };
    expect(consumable(cap, 2, "2026-10-21")).toEqual({ ok: true, consumed: 9, status: "APPROVED" });
    expect(consumable(cap, 4, "2026-10-21")).toMatchObject({ ok: false, reason: "only 3 remains of the approved 10" });
  });
});

describe("emergency window (A-161)", () => {
  const start = new Date("2026-10-21T08:00:00Z");
  it("is due 24 hours after it starts, pending before that, overdue after it, regularised whenever it is done", () => {
    const due = emergencyDue(start);
    expect(emergencyState(due, null, new Date("2026-10-21T20:00:00Z"))).toBe("pending");
    expect(emergencyState(due, null, new Date("2026-10-22T09:00:00Z"))).toBe("overdue");
    expect(emergencyState(due, new Date("2026-10-22T09:00:00Z"), new Date("2026-10-23T00:00:00Z"))).toBe("regularised");
  });
});

describe("evidence (Part 00 §9.5)", () => {
  it("lists what is still missing against each rule", () => {
    const missing = evidenceMissing([{ itemType: "photo", minCount: 2 }, { itemType: "gps", minCount: 1 }], [{ type: "photo" }, { type: "gps" }]);
    expect(missing).toEqual(["photo: 1 more needed"]);
    expect(evidenceMissing([{ itemType: "photo", minCount: 1 }], [{ type: "photo" }])).toEqual([]);
  });
});

describe("thresholds (Part 00 §9.4)", () => {
  const rows: ThresholdRow[] = [
    { key: "budget.warn_pct", scopeType: "COMPANY", scopeId: "ACME", value: 90, effectiveFrom: "2026-01-01", effectiveTo: null },
    { key: "budget.warn_pct", scopeType: "PROJECT", scopeId: "P3", value: 85, effectiveFrom: "2026-06-01", effectiveTo: null },
    { key: "budget.warn_pct", scopeType: "PROJECT", scopeId: "P3", value: 80, effectiveFrom: "2026-11-01", effectiveTo: null },
  ];
  const scope = { companyId: "ACME", projectId: "P3" };
  it("uses the most specific row that is effective on the date", () => {
    expect(thresholdAt(rows, "budget.warn_pct", "2026-07-01", scope)).toBe(85);
    expect(thresholdAt(rows, "budget.warn_pct", "2026-12-01", scope)).toBe(80);
    expect(thresholdAt(rows, "budget.warn_pct", "2026-03-01", { companyId: "ACME", projectId: "P9" })).toBe(90);
  });
  it("returns null, not a default, when nothing applies", () => {
    expect(thresholdAt(rows, "labour.ot_max_pct", "2026-07-01", scope)).toBeNull();
    expect(thresholdAt(rows, "budget.warn_pct", "2025-01-01", scope)).toBeNull();
  });
});

describe("configuration bodies (REQ-PROTOCOL-F07 to F09)", () => {
  it("refuses a threshold with an unknown scope, an evidence rule with an unknown type, and a matrix row with no band", () => {
    expect(() => configBody("THRESHOLD", { scopeType: "CITY", scopeId: "x", value: 1, effectiveFrom: "2026-01-01" })).toThrow(/scope is not valid/);
    expect(() => configBody("EVIDENCE_RULE", { itemType: "video", minCount: 1 })).toThrow(/item type/);
    expect(() => configBody("EXCEPTION_MATRIX", { minPct: 0 })).toThrow(/band/);
  });
  it("adds the scope key the active index uses", () => {
    expect(configBody("THRESHOLD", { scopeType: "PROJECT", scopeId: "P3", value: 85, effectiveFrom: "2026-06-01" })).toMatchObject({ scopeKey: "PROJECT|P3" });
  });
});
