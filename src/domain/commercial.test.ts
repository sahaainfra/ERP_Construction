import { describe, expect, it } from "vitest";
import {
  deviationSplit,
  earlyCompletionBonus,
  liquidatedDamages,
  mobilisationAdvanceRecovery,
  netDelay,
  priceVariation,
  retentionDeduction,
  securedAdvanceLimit,
  securedAdvanceRecovery,
} from "./commercial";

describe("mobilisation advance", () => {
  const base = { advance: 1000, contractValue: 10_000, startPct: 10, endPct: 50 };

  it("matches the annex formula for a bill inside the recovery window", () => {
    // Window is 1,000 to 5,000 (4,000 wide). A bill of 1,000 inside it recovers 1,000 × 1,000 ÷ 4,000 = 250.
    const recovered = mobilisationAdvanceRecovery({ ...base, cumulativeWorkBefore: 2000, workInBill: 1000 });
    expect(recovered).toBe(250);
  });

  it("recovers nothing before the window starts", () => {
    expect(mobilisationAdvanceRecovery({ ...base, cumulativeWorkBefore: 0, workInBill: 900 })).toBe(0);
  });

  it("recovers exactly the advance across all bills to the end of the window", () => {
    const first = mobilisationAdvanceRecovery({ ...base, cumulativeWorkBefore: 0, workInBill: 2000 });
    const second = mobilisationAdvanceRecovery({ ...base, cumulativeWorkBefore: 2000, workInBill: 3000 });
    expect(first + second).toBeCloseTo(1000);
    // Work beyond the window end recovers nothing more.
    expect(mobilisationAdvanceRecovery({ ...base, cumulativeWorkBefore: 5000, workInBill: 1000 })).toBe(0);
  });

  it("rejects a window where start is not before end", () => {
    expect(() => mobilisationAdvanceRecovery({ ...base, startPct: 50, endPct: 50, cumulativeWorkBefore: 0, workInBill: 1 })).toThrow(RangeError);
  });
});

describe("secured advance on materials", () => {
  it("limits the advance to 75 % of the lower of invoice and SOR rates", () => {
    expect(securedAdvanceLimit({ quantity: 100, invoiceRate: 50, sorRate: 60 })).toBe(3750);
  });

  it("recovers as material is consumed, capped at the outstanding balance", () => {
    expect(securedAdvanceRecovery({ advanceAmount: 3750, materialQuantity: 100, consumedQuantity: 40, outstanding: 3750 })).toBe(1500);
    expect(securedAdvanceRecovery({ advanceAmount: 3750, materialQuantity: 100, consumedQuantity: 40, outstanding: 1000 })).toBe(1000);
  });
});

describe("retention", () => {
  it("deducts 5 % of the bill by default", () => {
    expect(retentionDeduction({ billValue: 1000, retainedToDate: 0, contractValue: 100_000 })).toBe(50);
  });

  it("stops at the cap", () => {
    expect(retentionDeduction({ billValue: 1000, retainedToDate: 1990, contractValue: 100_000, capPct: 2 })).toBe(10);
    expect(retentionDeduction({ billValue: 1000, retainedToDate: 2000, contractValue: 100_000, capPct: 2 })).toBe(0);
  });
});

describe("price variation", () => {
  it("applies weighted index movement to the variable value", () => {
    // Labour 0.3 × (110 − 100) ÷ 100 = 0.03; cement 0.2 × (180 − 200) ÷ 200 = −0.02; sum 0.01 × 100,000.
    const adjustment = priceVariation({
      variableValue: 100_000,
      components: [
        { share: 0.3, baseIndex: 100, currentIndex: 110 },
        { share: 0.2, baseIndex: 200, currentIndex: 180 },
      ],
    });
    expect(adjustment).toBeCloseTo(1000);
  });

  it("rejects shares above 1", () => {
    expect(() =>
      priceVariation({
        variableValue: 1,
        components: [
          { share: 0.7, baseIndex: 1, currentIndex: 1 },
          { share: 0.5, baseIndex: 1, currentIndex: 1 },
        ],
      }),
    ).toThrow(RangeError);
  });
});

describe("liquidated damages and bonus", () => {
  it("charges rate × delay, capped", () => {
    expect(liquidatedDamages({ contractValue: 1_000_000, ratePerUnit: 0.0005, delayUnits: 4, capFraction: 0.1 })).toBe(2000);
    expect(liquidatedDamages({ contractValue: 1_000_000, ratePerUnit: 0.0005, delayUnits: 300, capFraction: 0.1 })).toBe(100_000);
  });

  it("nets extension of time off the delay", () => {
    expect(netDelay(10, 3)).toBe(7);
    expect(netDelay(2, 5)).toBe(0);
  });

  it("caps the early-completion bonus", () => {
    expect(earlyCompletionBonus({ ratePerDay: 1000, daysEarly: 5, cap: 4000 })).toBe(4000);
    expect(earlyCompletionBonus({ ratePerDay: 1000, daysEarly: 2, cap: 4000 })).toBe(2000);
  });
});

describe("BOQ deviation", () => {
  it("splits quantity above the ±25 % band", () => {
    const split = deviationSplit({ boqQty: 100, actualQty: 130 });
    expect(split).toEqual({ withinBandQty: 125, excessAboveQty: 5, excessBelowQty: 0 });
  });

  it("keeps all executed quantity at BOQ rate when below the band, and reports the shortfall", () => {
    const split = deviationSplit({ boqQty: 100, actualQty: 60 });
    expect(split).toEqual({ withinBandQty: 60, excessAboveQty: 0, excessBelowQty: 15 });
  });
});

describe("money is exact to paise (ADR-004, AC-7)", () => {
  it("returns exactly 1000 for the golden price-variation case, not 999.9999999999995", () => {
    const value = priceVariation({
      variableValue: 1000,
      components: [{ share: 0.5, baseIndex: 100, currentIndex: 110 }, { share: 0.25, baseIndex: 200, currentIndex: 220 }],
    });
    expect(value).toBe(75);
    expect(priceVariation({ variableValue: 1000, components: [{ share: 1, baseIndex: 100, currentIndex: 200 }] })).toBe(1000);
  });

  it("rounds a money result to paise, half up", () => {
    expect(retentionDeduction({ billValue: 10.005, retainedToDate: 0, contractValue: 1000 })).toBe(0.5);
    expect(retentionDeduction({ billValue: 0.1, retainedToDate: 0, contractValue: 1000, retentionPct: 25 })).toBe(0.03);
  });

  it("gives at most two decimal places for every money function", () => {
    const values = [
      mobilisationAdvanceRecovery({ advance: 1000, contractValue: 3000, startPct: 10, endPct: 60, cumulativeWorkBefore: 100, workInBill: 777 }),
      securedAdvanceLimit({ quantity: 3, invoiceRate: 10.1, sorRate: 9.9 }),
      securedAdvanceRecovery({ advanceAmount: 100, materialQuantity: 3, consumedQuantity: 1, outstanding: 100 }),
      retentionDeduction({ billValue: 333.33, retainedToDate: 0, contractValue: 10000 }),
      liquidatedDamages({ contractValue: 12345.67, ratePerUnit: 0.0005, delayUnits: 3, capFraction: 0.1 }),
      earlyCompletionBonus({ ratePerDay: 33.33, daysEarly: 3, cap: 1000 }),
    ];
    for (const v of values) expect(Math.round(v * 100) / 100).toBe(v);
  });
});
