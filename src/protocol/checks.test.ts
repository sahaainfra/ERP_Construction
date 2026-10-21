// Part 17 S1 pure tests: each pure check reads only the payload it is given, a missing source is "unavailable" and never a pass, and a
// proposal with parameters the check cannot use is refused (REQ-PROTOCOL-F03).
import { describe, expect, it } from "vitest";
import { fingerprintOf, runPureCheck, validateParams } from "./checks";

describe("pure checks (REQ-PROTOCOL-F03)", () => {
  it("THRESHOLD passes inside the limits and fails outside them, with the reason", () => {
    const params = { field: "qty", max: 1.0 };
    expect(runPureCheck("THRESHOLD", params, { qty: 0.8 })).toEqual({ status: "ok" });
    expect(runPureCheck("THRESHOLD", params, { qty: 1.4 })).toMatchObject({ status: "fail", reason: expect.stringContaining("above the limit") });
    expect(runPureCheck("THRESHOLD", params, {})).toMatchObject({ status: "fail", reason: expect.stringContaining("missing") });
  });

  it("DOCUMENT_REQUIRED names the documents that are missing", () => {
    const outcome = runPureCheck("DOCUMENT_REQUIRED", { kinds: ["quotation", "drawing"] }, { documents: [{ kind: "quotation" }] });
    expect(outcome).toEqual({ status: "fail", reason: "missing documents: drawing" });
  });

  it("SEQUENCE needs every earlier stage complete", () => {
    expect(runPureCheck("SEQUENCE", { requires: ["PLAN"] }, { completedStages: ["PLAN"] })).toEqual({ status: "ok" });
    expect(runPureCheck("SEQUENCE", { requires: ["PLAN", "VERIFY"] }, { completedStages: ["PLAN"] })).toMatchObject({ status: "fail" });
  });

  it("TIME_WINDOW checks the local time and the back-dating limit", () => {
    expect(runPureCheck("TIME_WINDOW", { from: "09:00", to: "18:00" }, { localTime: "08:30" })).toMatchObject({ status: "fail" });
    expect(runPureCheck("TIME_WINDOW", { maxBackdateDays: 2 }, { entryDate: "2026-10-10", today: "2026-10-21" })).toMatchObject({ status: "fail", reason: expect.stringContaining("back-dated") });
    expect(runPureCheck("TIME_WINDOW", { maxBackdateDays: 2 }, { entryDate: "2026-10-20", today: "2026-10-21" })).toEqual({ status: "ok" });
  });

  it("RECONCILIATION needs the period reconciled", () => {
    expect(runPureCheck("RECONCILIATION", {}, { periodStatus: "open" })).toMatchObject({ status: "fail" });
    expect(runPureCheck("RECONCILIATION", {}, { periodStatus: "reconciled" })).toEqual({ status: "ok" });
  });

  it("CUSTOM runs its rule and fails with its message when the rule is not met", () => {
    expect(runPureCheck("CUSTOM", { rule: "qty < 1" }, { qty: 0.5 })).toEqual({ status: "ok" });
    expect(runPureCheck("CUSTOM", { rule: "qty < 1", message: "Too much" }, { qty: 2 })).toEqual({ status: "fail", reason: "Too much" });
    expect(runPureCheck("CUSTOM", { rule: "qty / 0 > 1" }, { qty: 2 })).toMatchObject({ status: "fail", reason: expect.stringContaining("could not be evaluated") });
  });

  it("reports a missing source as unavailable, never as a pass", () => {
    expect(runPureCheck("BUDGET_AVAILABLE", {}, {})).toMatchObject({ status: "unavailable", reason: expect.stringContaining("Part 39") });
    expect(runPureCheck("PERMIT_VALID", {}, {})).toMatchObject({ status: "unavailable" });
  });

  it("leaves DUPLICATE and SOD to the database check", () => {
    expect(runPureCheck("DUPLICATE", {}, {})).toEqual({ status: "database" });
    expect(runPureCheck("SOD", {}, {})).toEqual({ status: "database" });
  });

  it("builds the same fingerprint for the same chosen fields", () => {
    expect(fingerprintOf(["vendor", "qty"], { vendor: "V1", qty: 4, other: 1 })).toBe(fingerprintOf(["vendor", "qty"], { qty: 4, vendor: "V1", other: 2 }));
    expect(fingerprintOf(["vendor"], { vendor: "V1" })).not.toBe(fingerprintOf(["vendor"], { vendor: "V2" }));
  });
});

describe("proposal parameters (REQ-PROTOCOL-F01)", () => {
  it("refuses a threshold with no limit, a rule that does not parse, and a duplicate check with no window", () => {
    expect(validateParams("THRESHOLD", { field: "qty" })).toEqual(["a threshold needs a min or a max"]);
    expect(validateParams("CUSTOM", { rule: "qty +" })[0]).toMatch(/not valid/);
    expect(validateParams("DUPLICATE", { fields: ["vendor"] })).toEqual(["a duplicate check needs fields and a window in hours"]);
  });

  it("accepts a well-formed proposal", () => {
    expect(validateParams("THRESHOLD", { field: "qty", max: 1 })).toEqual([]);
    expect(validateParams("CUSTOM", { rule: "qty < 1" })).toEqual([]);
  });
});
