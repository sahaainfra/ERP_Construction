// Commercial term formulas from Part 00 Annex B3. Every percentage, cap and index is a parameter:
// the annex states these are seed values, configured per contract and effective-dated.

const assertPct = (name: string, value: number) => {
  if (value < 0 || value > 100) throw new RangeError(`${name} must be between 0 and 100, got ${value}`);
};

/**
 * Mobilisation advance recovery for one bill.
 *
 * Recovery starts when cumulative work done reaches S % of the contract value and completes at E %.
 * For a bill that lies wholly inside that window this equals the annex formula:
 *   advance × (value of work in bill ÷ ((E − S) % × contract value)).
 * Work outside the window recovers nothing, so the total recovered never exceeds the advance.
 */
export function mobilisationAdvanceRecovery(input: {
  advance: number;
  contractValue: number;
  startPct: number; // S
  endPct: number; // E
  cumulativeWorkBefore: number;
  workInBill: number;
}): number {
  assertPct("startPct", input.startPct);
  assertPct("endPct", input.endPct);
  if (input.startPct >= input.endPct) throw new RangeError("startPct must be less than endPct");
  const windowStart = (input.startPct / 100) * input.contractValue;
  const windowEnd = (input.endPct / 100) * input.contractValue;
  const cumulativeAfter = input.cumulativeWorkBefore + input.workInBill;
  const overlap = Math.max(0, Math.min(cumulativeAfter, windowEnd) - Math.max(input.cumulativeWorkBefore, windowStart));
  return (input.advance * overlap) / (windowEnd - windowStart);
}

/** Secured advance limit on materials = P % × min(invoice rate, SOR rate) × quantity. Seed P = 75. */
export function securedAdvanceLimit(input: {
  quantity: number;
  invoiceRate: number;
  sorRate: number;
  advancePct?: number;
}): number {
  const pct = input.advancePct ?? 75;
  assertPct("advancePct", pct);
  return (pct / 100) * Math.min(input.invoiceRate, input.sorRate) * input.quantity;
}

/**
 * Secured advance recovered as materials are consumed. Recovery per unit = advance ÷ material quantity,
 * applied to the quantity consumed per MB, and capped at the advance still outstanding.
 */
export function securedAdvanceRecovery(input: {
  advanceAmount: number;
  materialQuantity: number;
  consumedQuantity: number;
  outstanding: number;
}): number {
  if (input.materialQuantity <= 0) return 0;
  const perUnit = input.advanceAmount / input.materialQuantity;
  return Math.min(perUnit * input.consumedQuantity, input.outstanding);
}

/**
 * Retention deducted from a bill = R % of bill value, limited so that total retention does not exceed
 * the cap C % of contract value. Seed R = 5. Omit capPct for no cap.
 */
export function retentionDeduction(input: {
  billValue: number;
  retainedToDate: number;
  contractValue: number;
  retentionPct?: number;
  capPct?: number;
}): number {
  const pct = input.retentionPct ?? 5;
  assertPct("retentionPct", pct);
  const perBill = (pct / 100) * input.billValue;
  if (input.capPct === undefined) return perBill;
  assertPct("capPct", input.capPct);
  const headroom = (input.capPct / 100) * input.contractValue - input.retainedToDate;
  return Math.max(0, Math.min(perBill, headroom));
}

/**
 * Price variation (escalation) = V × Σ kᵢ × (Iᵢ,current − Iᵢ,base) ÷ Iᵢ,base.
 * V is the value of work done in the period that is subject to price variation. The components' shares kᵢ
 * may not sum above 1; the remainder (1 − Σk) is the fixed, unindexed part.
 * Indices and base dates are versioned data; this function takes them as inputs.
 */
export function priceVariation(input: {
  variableValue: number;
  components: { share: number; baseIndex: number; currentIndex: number }[];
}): number {
  const totalShare = input.components.reduce((sum, c) => sum + c.share, 0);
  if (input.components.some((c) => c.share < 0) || totalShare > 1) {
    throw new RangeError("Component shares must be non-negative and sum to 1 or less");
  }
  const indexed = input.components.reduce((sum, c) => {
    if (c.baseIndex <= 0) throw new RangeError("baseIndex must be positive");
    return sum + c.share * ((c.currentIndex - c.baseIndex) / c.baseIndex);
  }, 0);
  return input.variableValue * indexed;
}

/** Delay net of extension of time granted: delay still chargeable, never negative. */
export const netDelay = (actualUnits: number, allowedUnits: number): number => Math.max(0, actualUnits - allowedUnits);

/**
 * Liquidated damages = rate × delay, with rate expressed as a fraction of contract value per delay unit
 * (per week or per day, as the contract states), capped at cap % of contract value.
 * Pass delayUnits already net of EOT (see netDelay).
 */
export function liquidatedDamages(input: {
  contractValue: number;
  ratePerUnit: number; // fraction of contract value per delay unit, e.g. 0.0005 for 0.05 % per week
  delayUnits: number;
  capFraction: number; // e.g. 0.1 for 10 %
}): number {
  const uncapped = input.contractValue * input.ratePerUnit * Math.max(0, input.delayUnits);
  return Math.min(uncapped, input.contractValue * input.capFraction);
}

/** Early-completion bonus = rate per day × days early, capped. */
export function earlyCompletionBonus(input: { ratePerDay: number; daysEarly: number; cap: number }): number {
  return Math.min(input.ratePerDay * Math.max(0, input.daysEarly), input.cap);
}

/**
 * Split a quantity against the BOQ deviation band (default ±25 %).
 * Quantities inside the band are paid at the BOQ rate. Quantity above the band needs a derived or agreed rate
 * (B3). Quantity below the band is reported separately because whether it triggers a rate revision depends on
 * the contract.
 */
export function deviationSplit(input: { boqQty: number; actualQty: number; limitPct?: number }): {
  withinBandQty: number;
  excessAboveQty: number;
  excessBelowQty: number;
} {
  const limit = input.limitPct ?? 25;
  assertPct("limitPct", limit);
  const upper = input.boqQty * (1 + limit / 100);
  const lower = input.boqQty * (1 - limit / 100);
  const excessAboveQty = Math.max(0, input.actualQty - upper);
  const excessBelowQty = Math.max(0, lower - input.actualQty);
  // Everything executed is paid at BOQ rate except the part above the band.
  const withinBandQty = input.actualQty - excessAboveQty;
  return { withinBandQty, excessAboveQty, excessBelowQty };
}
