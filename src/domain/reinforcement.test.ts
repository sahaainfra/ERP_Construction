import { describe, expect, it } from "vitest";
import { barWeightKg, cutLengthMm, unitWeightKgPerM } from "./reinforcement";

describe("reinforcement", () => {
  it("computes unit weight as d² ÷ 162.2", () => {
    expect(unitWeightKgPerM(16)).toBeCloseTo(1.578, 3);
    expect(unitWeightKgPerM(12)).toBeCloseTo(0.888, 3);
  });

  it("deducts bends as multiples of the diameter and adds hooks", () => {
    // 1,000 + 200 hook − 2 × 12 (one 90° bend) = 1,176 mm.
    expect(
      cutLengthMm({ diameterMm: 12, straightSegmentsMm: [1000], hookAllowancesMm: [200], bendAnglesDeg: [90] }),
    ).toBe(1176);
  });

  it("uses the seed factors for 45°, 135° and 180° bends", () => {
    expect(cutLengthMm({ diameterMm: 10, straightSegmentsMm: [1000], bendAnglesDeg: [45] })).toBe(990);
    expect(cutLengthMm({ diameterMm: 10, straightSegmentsMm: [1000], bendAnglesDeg: [135] })).toBe(970);
    expect(cutLengthMm({ diameterMm: 10, straightSegmentsMm: [1000], bendAnglesDeg: [180] })).toBe(960);
  });

  it("rejects a bend angle with no configured factor", () => {
    expect(() => cutLengthMm({ diameterMm: 12, straightSegmentsMm: [1000], bendAnglesDeg: [30] })).toThrow(RangeError);
  });

  it("gives bar weight as cut length in metres times unit weight", () => {
    expect(barWeightKg({ diameterMm: 12, straightSegmentsMm: [1000] })).toBeCloseTo(0.888, 3);
  });
});
