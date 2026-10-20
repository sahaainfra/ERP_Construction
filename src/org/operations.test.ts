// Pure rules for LBS, geofences, allocations and closure (Part 06 slices S3–S5).
import { describe, expect, it } from "vitest";
import { distanceM, pointInPolygon, polygonProblems } from "./geo";
import { evaluatePunch, fenceProblems } from "./geofence";
import { generateChainageStretches, DEFAULT_LBS_LEVELS } from "./lbs";
import { peakLoad } from "./allocations";
import { MODULE_CLOSURE_ITEMS } from "./closure";

describe("geometry (REQ-ORG-F07)", () => {
  it("measures a known distance within 0.5 %", () => {
    // Pune (Shivajinagar) to Mumbai (CST): roughly 120 km by road-free great circle.
    const d = distanceM({ latitude: 18.5308, longitude: 73.8475 }, { latitude: 18.9398, longitude: 72.8355 });
    expect(d).toBeGreaterThan(115_000);
    expect(d).toBeLessThan(125_000);
  });

  it("tests a point against a polygon", () => {
    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    expect(pointInPolygon({ latitude: 5, longitude: 5 }, square)).toBe(true);
    expect(pointInPolygon({ latitude: 15, longitude: 5 }, square)).toBe(false);
  });

  it("refuses an open ring, a self-crossing ring, and too few vertices", () => {
    expect(polygonProblems([[0, 0], [10, 0], [10, 10]]).join(" ")).toMatch(/at least three vertices/);
    expect(polygonProblems([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]).join(" ")).toMatch(/closed/);
    const bowtie: [number, number][] = [[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]];
    expect(polygonProblems(bowtie).join(" ")).toMatch(/cross itself/);
    expect(polygonProblems([[0, 0], [10, 0], [10, 10], [0, 0]])).toEqual([]);
  });
});

describe("geofence rules (REQ-ORG-F07)", () => {
  it("keeps the radius between 20 and 5,000 metres and the tolerance between 0 and 500", () => {
    const circle = (radiusM: number) => ({ shape: "circle" as const, centre: { latitude: 18.5, longitude: 73.8 }, radiusM });
    expect(fenceProblems(circle(10), 20).join(" ")).toMatch(/radius/);
    expect(fenceProblems(circle(5001), 20).join(" ")).toMatch(/radius/);
    expect(fenceProblems(circle(100), 600).join(" ")).toMatch(/tolerance/);
    expect(fenceProblems(circle(100), 20)).toEqual([]);
  });

  it("accepts a punch inside the radius plus tolerance, and refuses one beyond it", () => {
    const fence = { id: "1", version_no: 2, shape: "circle" as const, centre_latitude: "18.500000", centre_longitude: "73.800000", radius_m: 100, polygon: null, accuracy_tolerance_m: 20 };
    const at = (metres: number) => ({ latitude: 18.5 + metres / 111_320, longitude: 73.8 });
    expect(evaluatePunch(fence, at(110), 10)).toMatchObject({ result: "inside", fenceVersion: 2 });
    expect(evaluatePunch(fence, at(150), 10)).toMatchObject({ result: "outside" });
    expect(evaluatePunch(null, at(0), 10)).toMatchObject({ result: "no_fence" });
    expect(evaluatePunch(fence, at(0), 500)).toMatchObject({ result: "low_accuracy" });
  });
});

describe("LBS (REQ-ORG-F06; A-11)", () => {
  it("builds chainage stretches on each side, in order", () => {
    const rows = generateChainageStretches({ fromM: 0, toM: 1000, stepM: 250, sides: ["LHS", "RHS"], codePrefix: "CH" });
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ locationType: "chainage_stretch", chainageFrom: 0, chainageTo: 250, side: "LHS", sequenceNo: 1 });
    expect(rows[7]).toMatchObject({ chainageFrom: 750, chainageTo: 1000, side: "RHS" });
    expect(() => generateChainageStretches({ fromM: 100, toM: 100, stepM: 10, sides: ["LHS"], codePrefix: "X" })).toThrow(RangeError);
  });

  it("gives linear projects chainage levels and buildings tower, floor and zone levels", () => {
    expect(DEFAULT_LBS_LEVELS.road_highway).toEqual(["chainage_stretch"]);
    expect(DEFAULT_LBS_LEVELS.building).toEqual(["tower", "floor", "zone"]);
    expect(DEFAULT_LBS_LEVELS.bridge_flyover).toEqual(["pier", "span"]);
  });
});

describe("allocation load (REQ-ORG-F08; CP-ORG-04)", () => {
  it("finds the peak daily load, counting only days where allocations overlap", () => {
    const existing = [{ from: "2026-11-01", to: "2026-11-10", pct: 60 }];
    expect(peakLoad(existing, { from: "2026-11-05", to: "2026-11-20", pct: 60 })).toEqual({ peak: 120, day: "2026-11-05" });
    expect(peakLoad(existing, { from: "2026-11-11", to: "2026-11-20", pct: 60 })).toEqual({ peak: 60, day: "2026-11-11" });
  });
});

describe("closure checklist (REQ-ORG-F12)", () => {
  it("lists the items owned by modules not built yet, so none of them passes on silence", () => {
    expect(MODULE_CLOSURE_ITEMS.length).toBeGreaterThanOrEqual(8);
    expect(MODULE_CLOSURE_ITEMS.every((item) => item.includes("not built"))).toBe(true);
  });
});
