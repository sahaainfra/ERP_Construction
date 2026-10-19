// Reinforcement steel formulas from Part 00 Annex B4. Bend deductions and hook allowances are seed values
// configured per project under IS 2502 / IS 456 / IS 13920 and the drawing notes.

/** Seed bend deduction factors, in multiples of the bar diameter d. */
export const SEED_BEND_DEDUCTION_FACTORS: Readonly<Record<number, number>> = {
  45: 1,
  90: 2,
  135: 3,
  180: 4,
};

/** Unit weight of steel bar in kg per metre: d² ÷ 162.2, with d in millimetres. */
export function unitWeightKgPerM(diameterMm: number): number {
  if (diameterMm <= 0) throw new RangeError("diameterMm must be positive");
  return (diameterMm * diameterMm) / 162.2;
}

/**
 * Cut length in millimetres = Σ straight segments + hooks − bend deductions.
 * Each bend deducts factor × d, with the factor taken from the bend table (default: the seed table above).
 */
export function cutLengthMm(input: {
  diameterMm: number;
  straightSegmentsMm: readonly number[];
  hookAllowancesMm?: readonly number[];
  bendAnglesDeg?: readonly number[];
  bendDeductionFactors?: Readonly<Record<number, number>>;
}): number {
  const table = input.bendDeductionFactors ?? SEED_BEND_DEDUCTION_FACTORS;
  const straight = input.straightSegmentsMm.reduce((sum, v) => sum + v, 0);
  const hooks = (input.hookAllowancesMm ?? []).reduce((sum, v) => sum + v, 0);
  const deduction = (input.bendAnglesDeg ?? []).reduce((sum, angle) => {
    const factor = table[angle];
    if (factor === undefined) throw new RangeError(`No bend deduction configured for ${angle}°`);
    return sum + factor * input.diameterMm;
  }, 0);
  return straight + hooks - deduction;
}

/** Bar weight in kg = cut length (m) × unit weight. */
export function barWeightKg(input: Parameters<typeof cutLengthMm>[0]): number {
  return (cutLengthMm(input) / 1000) * unitWeightKgPerM(input.diameterMm);
}
