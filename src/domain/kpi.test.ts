import { describe, expect, it } from "vitest";
import {
  certificationLagDays,
  costOfQuality,
  cpi,
  cvrMargin,
  dpo,
  dso,
  eacCpi,
  etc,
  firstTimeInspectionPass,
  grossMargin,
  labourProductivityIndex,
  ltifr,
  materialVariance,
  mtbf,
  mttr,
  physicalProgress,
  plantAvailability,
  plantUtilisation,
  procurementCycleDays,
  rfiTurnaroundDays,
  spi,
  tcpi,
  trifr,
  underOverBilling,
  vac,
  vendorOtif,
  workingDaysBetween,
} from "./kpi";

describe("earned value", () => {
  it("weights physical progress by activity weight", () => {
    expect(
      physicalProgress([
        { weight: 50, percentComplete: 100 },
        { weight: 50, percentComplete: 50 },
      ]),
    ).toBe(75);
  });

  it("returns null for progress with no weight", () => {
    expect(physicalProgress([])).toBeNull();
  });

  it("computes SPI, CPI and the EAC chain", () => {
    expect(spi(80, 100)).toBe(0.8);
    expect(cpi(80, 100)).toBe(0.8);
    const eac = eacCpi(1000, 0.8);
    expect(eac).toBe(1250);
    expect(etc(1250, 100)).toBe(1150);
    expect(vac(1000, 1250)).toBe(-250);
  });

  it("computes TCPI as remaining budget over remaining funds", () => {
    expect(tcpi(1000, 400, 500)).toBeCloseTo(1.2);
  });

  it("returns null when a denominator is zero", () => {
    expect(spi(10, 0)).toBeNull();
    expect(cpi(10, 0)).toBeNull();
    expect(eacCpi(1000, 0)).toBeNull();
    expect(grossMargin(0, 0)).toBeNull();
  });
});

describe("commercial and cost", () => {
  it("computes gross margin as a fraction", () => {
    expect(grossMargin(1000, 800)).toBe(0.2);
  });

  it("computes CVR margin as value minus cost", () => {
    const margin = cvrMargin({
      certified: 800,
      workDoneNotCertified: 100,
      agreedVariations: 50,
      probabilityWeightedPending: 100,
      actualCost: 700,
      accruals: 50,
      provisions: 30,
    });
    expect(margin).toBe(270);
  });

  it("signs under-billing positive", () => {
    expect(underOverBilling(500, 400)).toBe(100);
  });

  it("measures material variance against wastage-adjusted theoretical use", () => {
    // Theoretical = 100 × 0.5 × 1.02 = 51; actual 55 gives a variance of 4.
    expect(materialVariance({ actualQty: 55, executedQty: 100, normPerUnit: 0.5, wastageAllowance: 0.02 })).toBeCloseTo(4);
  });
});

describe("plant and labour", () => {
  it("computes utilisation against available hours", () => {
    // Available = 720 − 120 = 600; 500 / 600.
    expect(plantUtilisation(500, 720, 120)).toBeCloseTo(0.8333, 4);
  });

  it("computes availability and reliability", () => {
    expect(plantAvailability(100, 10)).toBeCloseTo(0.9);
    expect(mtbf(1000, 4)).toBe(250);
    expect(mttr(20, 4)).toBe(5);
  });

  it("computes labour productivity against the norm", () => {
    // 200 output over 10 man-days is 20 per man-day; the norm is 25.
    expect(labourProductivityIndex(200, 10, 25)).toBeCloseTo(0.8);
    expect(labourProductivityIndex(0, 0, 25)).toBeNull();
  });
});

describe("working capital and time", () => {
  it("computes DSO and DPO", () => {
    expect(dso(300, 1000, 90)).toBe(27);
    expect(dpo(200, 1000, 60)).toBe(12);
  });

  it("counts calendar lag for certification and procurement", () => {
    expect(certificationLagDays(new Date(2026, 0, 1), new Date(2026, 0, 15))).toBe(14);
    expect(procurementCycleDays(new Date(2026, 0, 1), new Date(2026, 0, 11))).toBe(10);
  });

  it("excludes Sundays and listed holidays from working days", () => {
    // Mon 5 Jan 2026 to Mon 12 Jan 2026: Tue–Sat is 5 days, Sunday is excluded, Mon 12 counts: 6.
    const start = new Date(2026, 0, 5);
    const end = new Date(2026, 0, 12);
    expect(workingDaysBetween(start, end)).toBe(6);
    expect(workingDaysBetween(start, end, ["2026-01-07"])).toBe(5);
    expect(rfiTurnaroundDays(start, end)).toBe(6);
  });
});

describe("safety and quality", () => {
  it("computes LTIFR and TRIFR per million man-hours", () => {
    expect(ltifr(2, 500_000)).toBe(4);
    expect(trifr(5, 1_000_000)).toBe(5);
    expect(ltifr(0, 0)).toBeNull();
  });

  it("computes first-time pass, cost of quality and OTIF", () => {
    expect(firstTimeInspectionPass(9, 10)).toBe(0.9);
    expect(costOfQuality({ rework: 10, ncr: 20, testing: 30, inspection: 40 })).toBe(100);
    expect(vendorOtif(8, 10)).toBe(0.8);
  });
});
