// Pure policy rules (Part 07 REQ-IAM-F07, F08, F09).
import { describe, expect, it } from "vitest";
import { conditionsHold, decide, scopeCovers, scopeIds, type Grant } from "./policy";
import { maskValue } from "./masking";

const g = (over: Partial<Grant>): Grant => ({ roleCode: "buyer", effect: "allow", conditions: {}, scopeType: "project", scopeId: "P1", ...over });

describe("decision (REQ-IAM-F07)", () => {
  it("denies by default when no grant applies", () => {
    expect(decide([], "u1", { projectId: "P1" }, "po.approve").allowed).toBe(false);
  });

  it("allows within the scope of an approved grant and names the source", () => {
    const d = decide([g({})], "u1", { projectId: "P1" }, "po.approve");
    expect(d).toMatchObject({ allowed: true, source: { roleCode: "buyer", scopeType: "project", scopeId: "P1" } });
  });

  it("denies outside the scope", () => {
    expect(decide([g({})], "u1", { projectId: "P2" }, "po.approve").allowed).toBe(false);
  });

  it("lets an explicit deny win over an allow in the same scope", () => {
    const grants = [g({ scopeType: "tenant", scopeId: null }), g({ effect: "deny", scopeId: "P2" })];
    expect(decide(grants, "u1", { projectId: "P1" }, "po.approve").allowed).toBe(true);
    expect(decide(grants, "u1", { projectId: "P2" }, "po.approve")).toMatchObject({ allowed: false, reason: expect.stringContaining("explicitly denied") });
  });

  it("applies an own-records scope only to records the person owns", () => {
    const own = g({ scopeType: "own", scopeId: null });
    expect(scopeCovers(own, "u1", { ownerUserId: "u1" })).toBe(true);
    expect(scopeCovers(own, "u1", { ownerUserId: "u2" })).toBe(false);
  });

  it("without a resource, any grant counts (menu gating)", () => {
    expect(decide([g({})], "u1", undefined, "po.approve").allowed).toBe(true);
  });
});

describe("conditions (REQ-IAM-F07 ABAC)", () => {
  it("compares the amount with the limit and fails when the amount is missing", () => {
    expect(conditionsHold({ maxAmountPaise: 100000 }, { attributes: { amountPaise: 50000 } })).toBe(true);
    expect(conditionsHold({ maxAmountPaise: 100000 }, { attributes: { amountPaise: 200000 } })).toBe(false);
    expect(conditionsHold({ maxAmountPaise: 100000 }, { attributes: {} })).toBe(false);
  });

  it("checks the status and fails closed on an unknown condition", () => {
    expect(conditionsHold({ statusIn: ["draft"] }, { attributes: { status: "draft" } })).toBe(true);
    expect(conditionsHold({ statusIn: ["draft"] }, { attributes: { status: "approved" } })).toBe(false);
    expect(conditionsHold({ deviceTrust: "managed" }, { attributes: {} })).toBe(false);
  });
});

describe("data scope (REQ-IAM-F08)", () => {
  it("lists all ids for a tenant-wide allow, minus denied ids", () => {
    const grants = [g({ scopeType: "tenant", scopeId: null }), g({ effect: "deny", scopeId: "P9" })];
    expect(scopeIds(grants, "project")).toEqual({ all: true, ids: [], excluded: ["P9"] });
  });

  it("lists only the allowed project ids when there is no tenant-wide allow", () => {
    const grants = [g({ scopeId: "P1" }), g({ scopeId: "P2" }), g({ effect: "deny", scopeId: "P2" })];
    expect(scopeIds(grants, "project")).toEqual({ all: false, ids: ["P1"], excluded: ["P2"] });
  });

  it("leaves out grants with conditions from a list, which has no single record to test them against", () => {
    expect(scopeIds([g({ conditions: { maxAmountPaise: 1 } })], "project").ids).toEqual([]);
  });
});

describe("field masks (REQ-IAM-F09)", () => {
  it("removes a fully masked field, keeps the last four of a partial mask, and hashes when asked", () => {
    expect(maskValue(90000, "full")).toBeUndefined();
    expect(maskValue("ABCDE1234F", "partial")).toBe("******234F".replace("******", "******"));
    expect(maskValue("1234567890", "partial")).toBe("******7890");
    expect(String(maskValue("ABCDE1234F", "hash"))).toMatch(/^[0-9a-f]{12}$/);
  });
});
