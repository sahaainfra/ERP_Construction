// Wastage, norm and productivity seeds from Part 00 Annex B6. Project-overridable.
// Consumption norms come from approved rate analyses (Part 29) per item version, not from this file.

/** Material wastage allowances (PC-4), as fractions. */
export const SEED_WASTAGE = {
  cement: 0.02,
  steel: 0.03,
  "bricks-blocks": 0.05,
  aggregates: 0.05,
  sand: 0.05,
  rmc: 0.015,
  tiles: 0.05,
  paint: 0.05,
  timber: 0.1,
  bitumen: 0.02,
} as const satisfies Record<string, number>;

export type WastageMaterial = keyof typeof SEED_WASTAGE;

/** Formwork repetitions per system. Wear per use drives write-off (Part 49). Ranges as stated in B6. */
export const FORMWORK_REPETITIONS = {
  plywood: { min: 6, max: 10 },
  steel: { min: 50, max: 100 },
  aluminium: { min: 150, max: 250 },
} as const;

/**
 * Wear allowance per use for a formwork system, taken as straight-line: 1 ÷ repetitions.
 * This is an interpretation: Annex B6 says wear per use drives write-off but gives no formula.
 * Pass a repetition count within the seeded range (or a value the company has measured).
 */
export const formworkWearPerUse = (repetitions: number): number => {
  if (repetitions <= 0) throw new RangeError("repetitions must be positive");
  return 1 / repetitions;
};
