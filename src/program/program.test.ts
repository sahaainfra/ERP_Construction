import { describe, expect, it } from "vitest";
import { PARTS, PHASES, canRunInParallel, canStart, getPart, partKey, phaseOf, runnableNow, transitiveDependencies } from "./index";
import { verifyProgram } from "./verify";

describe("Annex C index", () => {
  it("contains all 95 Parts, matching the phase table", () => {
    expect(PARTS).toHaveLength(95);
    expect(PHASES.reduce((sum, ph) => sum + ph.count, 0)).toBe(95);
  });

  it("satisfies every structural invariant in Annex C", () => {
    expect(verifyProgram()).toEqual([]);
  });

  it("orders lettered Parts between their number and the next", () => {
    expect(partKey("08")).toBeLessThan(partKey("08A"));
    expect(partKey("08A")).toBeLessThan(partKey("09"));
    expect(partKey("80")).toBeLessThan(partKey("80A"));
    expect(partKey("80A")).toBeLessThan(partKey("81"));
  });

  it("assigns phases from the phase table", () => {
    expect(phaseOf("00").name).toBe("Governance, Discovery & Architecture");
    expect(phaseOf("08A").phase).toBe(2);
    expect(phaseOf("52A").phase).toBe(8);
    expect(phaseOf("86").phase).toBe(15);
  });
});

describe("start rule", () => {
  it("lets Part 00 start immediately and blocks Part 01 until Part 00 is approved", () => {
    expect(canStart("00", new Set())).toBe(true);
    expect(canStart("01", new Set())).toBe(false);
    expect(canStart("01", new Set(["00"]))).toBe(true);
  });

  it("requires every dependency for a multi-dependency Part", () => {
    // Part 39 depends on 26, 29, 33 and 38.
    expect(canStart("39", new Set(["26", "29", "33"]))).toBe(false);
    expect(canStart("39", new Set(["26", "29", "33", "38"]))).toBe(true);
  });

  it("lists only Parts whose dependencies are all approved, in execution order", () => {
    expect(runnableNow(new Set()).map((p) => p.id)).toEqual(["00"]);
    expect(runnableNow(new Set(["00"])).map((p) => p.id)).toEqual(["01"]);
    // With 00 and 01 approved, 02 is next. 03 needs 02 too, so it is not yet runnable.
    expect(runnableNow(new Set(["00", "01"])).map((p) => p.id)[0]).toBe("02");
  });

  it("excludes Parts that are already running", () => {
    const runnable = runnableNow(new Set(["00", "01"]), new Set(["02"])).map((p) => p.id);
    expect(runnable).not.toContain("02");
  });

  it("walks the full chain of dependencies for Part 86", () => {
    const chain = transitiveDependencies("86");
    expect(chain.has("00")).toBe(true);
    expect(chain.has("85")).toBe(true);
    expect(chain.size).toBeGreaterThan(50);
  });
});

describe("parallel lanes", () => {
  it("allows annex-listed independent pairs", () => {
    expect(canRunInParallel("09", "10")).toBe(true);
    expect(canRunInParallel("33", "37")).toBe(true);
  });

  it("refuses pairs where one depends on the other", () => {
    expect(canRunInParallel("41", "17")).toBe(false);
    expect(getPart("00").parallelWith).toEqual([]);
  });
});
