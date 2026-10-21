// Pure checks for the enterprise structure (Part 06 §7).
import { describe, expect, it } from "vitest";
import { coordinatesProblems, datesProblems, gstinCheckCharacter, gstinProblems, isPan, isStateCode, isUnitCode } from "./validation";
import { ALLOWED_PARENTS, UNIT_TYPES } from "./structure";

describe("PAN (§7)", () => {
  it("accepts a company PAN and refuses a malformed one", () => {
    expect(isPan("AAPFU0939F")).toBe(true);
    expect(isPan("AAPXU0939F")).toBe(false); // X is not a PAN holder type
    expect(isPan("aapfu0939f")).toBe(false);
    expect(isPan("AAPFU09390")).toBe(false);
  });
});

describe("GSTIN (§7)", () => {
  // 27AAPFU0939F1ZV is the sample GSTIN in the GST documentation: state 27, PAN AAPFU0939F, check character V.
  const sample = "27AAPFU0939F1ZV";

  it("computes the documented check character", () => {
    expect(gstinCheckCharacter(sample.slice(0, 14))).toBe("V");
  });

  it("accepts a GSTIN whose PAN and state match", () => {
    expect(gstinProblems(sample, { pan: "AAPFU0939F", stateCode: "27" })).toEqual([]);
  });

  it("refuses a GSTIN with a wrong check character", () => {
    expect(gstinProblems("27AAPFU0939F1ZW")).toEqual(["GSTIN check character is wrong"]);
  });

  it("refuses a GSTIN that does not carry the entity's PAN, or whose state differs", () => {
    expect(gstinProblems(sample, { pan: "BBBBB1234B" })).toContain("GSTIN does not carry the legal entity's PAN");
    expect(gstinProblems(sample, { stateCode: "29" })).toContain("GSTIN state code does not match the registration state");
  });

  it("refuses the wrong format", () => {
    expect(gstinProblems("27AAPFU0939F1Z")).toEqual(["GSTIN has the wrong format"]);
  });
});

describe("codes, states, coordinates and dates", () => {
  it("accepts unit codes in the agreed shape only", () => {
    expect(isUnitCode("MUM-01")).toBe(true);
    expect(isUnitCode("m1")).toBe(false);
    expect(isUnitCode("A")).toBe(false);
  });

  it("accepts two-digit state codes from 01 to 39 and refuses others", () => {
    expect(isStateCode("27")).toBe(true);
    expect(isStateCode("00")).toBe(false);
    expect(isStateCode("4")).toBe(false);
  });

  it("requires latitude and longitude together and within range", () => {
    expect(coordinatesProblems(null, null)).toEqual([]);
    expect(coordinatesProblems(19.07, null)).toEqual(["latitude and longitude must be given together"]);
    expect(coordinatesProblems(91, 72)).toEqual(["latitude must be between -90 and 90"]);
    expect(coordinatesProblems(19.07, 181)).toEqual(["longitude must be between -180 and 180"]);
  });

  it("refuses a valid-to before the valid-from", () => {
    expect(datesProblems("2026-04-01", "2026-03-31")).toEqual(["valid-to cannot be before valid-from"]);
    expect(datesProblems("2026-04-01", null)).toEqual([]);
    expect(datesProblems("01/04/2026", null)).toEqual(["valid-from must be a date (YYYY-MM-DD)"]);
  });
});

describe("hierarchy rules (§6)", () => {
  it("lets every unit type be placed, and only a group or a company sit at the top", () => {
    for (const type of UNIT_TYPES) expect(ALLOWED_PARENTS[type].length).toBeGreaterThan(0);
    expect(ALLOWED_PARENTS.group).toEqual(["root"]);
    expect(ALLOWED_PARENTS.branch).not.toContain("root");
  });
});
