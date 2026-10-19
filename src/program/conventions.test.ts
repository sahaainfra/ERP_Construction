import { describe, expect, it } from "vitest";
import { assertValid, evidenceRoot, isValid } from "./conventions";

describe("§1.3 identifier conventions", () => {
  it.each([
    ["part", "46"],
    ["part", "50A"],
    ["moduleCode", "proc"],
    ["featureFlag", "ff.proc.rfq"],
    ["featureFlag", "ff.proc"],
    ["requirement", "REQ-PROC-F07"],
    ["controlPoint", "CP-PROC-03"],
    ["detectionRule", "DR-13"],
    ["permission", "proc.po.approve"],
    ["event", "proc.po.approved"],
    ["api", "/api/v1/proc/purchase-orders"],
    ["table", "proc_purchase_orders"],
  ] as const)("accepts the §1.3 example for %s: %s", (kind, value) => {
    expect(isValid(kind, value)).toBe(true);
  });

  it.each([
    ["part", "5"],
    ["part", "50D"],
    ["moduleCode", "Proc"],
    ["featureFlag", "proc.rfq"],
    ["requirement", "REQ-PROC-07"],
    ["controlPoint", "CP-proc-03"],
    ["detectionRule", "DR-1"],
    ["permission", "proc.approve"],
    ["event", "proc.po.Approved"],
    ["api", "/api/proc/purchase-orders"],
    ["table", "purchase_order"],
  ] as const)("rejects a malformed %s: %s", (kind, value) => {
    expect(isValid(kind, value)).toBe(false);
  });

  it("names the rule that failed", () => {
    expect(() => assertValid("requirement", "REQ-PROC-7")).toThrow(/requirement convention/);
  });

  it("builds the evidence root from the module code", () => {
    expect(evidenceRoot("proc")).toBe("docs/erp-program/modules/proc/");
    expect(() => evidenceRoot("Proc")).toThrow(RangeError);
  });
});
