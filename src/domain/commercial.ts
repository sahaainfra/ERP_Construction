// Commercial term formulas from Part 00 Annex B3. Every percentage, cap and index is a parameter:
// the annex states these are seed values, configured per contract and effective-dated.
// Money is computed in decimal arithmetic (ADR-004, AC-7). Intermediate values are exact; the result is rounded to
// paise (two decimal places, half up) once, at the output. Quantities are not money and stay as numbers.
import Decimal from "decimal.js";

const D = (value: number | Decimal) => new Decimal(value);

/** Rounds a money amount to paise at the policy point. */
const money = (amount: Decimal): number => amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

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
  const windowStart = D(input.startPct).div(100).times(input.contractValue);
  const windowEnd = D(input.endPct).div(100).times(input.contractValue);
  const cumulativeAfter = D(input.cumulativeWorkBefore).plus(input.workInBill);
  const overlap = Decimal.max(0, Decimal.min(cumulativeAfter, windowEnd).minus(Decimal.max(input.cumulativeWorkBefore, windowStart)));
  return money(D(input.advance).times(overlap).div(windowEnd.minus(windowStart)));
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
  return money(D(pct).div(100).times(Decimal.min(input.invoiceRate, input.sorRate)).times(input.quantity));
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
  const perUnit = D(input.advanceAmount).div(input.materialQuantity);
  return money(Decimal.min(perUnit.times(input.consumedQuantity), input.outstanding));
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
  const perBill = D(pct).div(100).times(input.billValue);
  if (input.capPct === undefined) return money(perBill);
  assertPct("capPct", input.capPct);
  const headroom = D(input.capPct).div(100).times(input.contractValue).minus(input.retainedToDate);
  return money(Decimal.max(0, Decimal.min(perBill, headroom)));
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
  const totalShare = input.components.reduce((sum, c) => sum.plus(c.share), D(0));
  if (input.components.some((c) => c.share < 0) || totalShare.greaterThan(1)) {
    throw new RangeError("Component shares must be non-negative and sum to 1 or less");
  }
  const indexed = input.components.reduce((sum, c) => {
    if (c.baseIndex <= 0) throw new RangeError("baseIndex must be positive");
    const base = D(c.baseIndex);
    return sum.plus(D(c.share).times(D(c.currentIndex).minus(base).div(base)));
  }, D(0));
  return money(D(input.variableValue).times(indexed));
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
  const uncapped = D(input.contractValue).times(input.ratePerUnit).times(Math.max(0, input.delayUnits));
  return money(Decimal.min(uncapped, D(input.contractValue).times(input.capFraction)));
}

/** Early-completion bonus = rate per day × days early, capped. */
export function earlyCompletionBonus(input: { ratePerDay: number; daysEarly: number; cap: number }): number {
  return money(Decimal.min(D(input.ratePerDay).times(Math.max(0, input.daysEarly)), input.cap));
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
