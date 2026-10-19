// KPI formulas from Part 00 Annex B7. Each ratio returns null when its denominator is zero, so a
// missing or empty input never shows as a number. Certified KPIs are defined in the metric
// catalogue (Part 75); these are the reference formulas used by the calculation engine (Part 22).

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

/** Physical progress: Σ(weight × activity % complete) ÷ Σ weight. Percentages are 0–100. */
export function physicalProgress(items: { weight: number; percentComplete: number }[]): number | null {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  const earned = items.reduce((sum, i) => sum + i.weight * i.percentComplete, 0);
  return ratio(earned, totalWeight);
}

/** SPI = EV ÷ PV. */
export const spi = (ev: number, pv: number): number | null => ratio(ev, pv);
/** CPI = EV ÷ AC. */
export const cpi = (ev: number, ac: number): number | null => ratio(ev, ac);
/** SV = EV − PV. */
export const scheduleVariance = (ev: number, pv: number): number => ev - pv;
/** CV = EV − AC. */
export const costVariance = (ev: number, ac: number): number => ev - ac;

/** EAC (CPI method) = BAC ÷ CPI. Index method for comparison only; the primary EAC is the bottom-up method (SE-5). */
export function eacCpi(bac: number, cpiValue: number): number | null {
  return ratio(bac, cpiValue);
}
/** ETC = EAC − AC. */
export const etc = (eac: number, ac: number): number => eac - ac;
/** VAC = BAC − EAC. */
export const vac = (bac: number, eac: number): number => bac - eac;
/** TCPI = (BAC − EV) ÷ (BAC − AC): the efficiency needed on remaining work to finish at budget. */
export const tcpi = (bac: number, ev: number, ac: number): number | null => ratio(bac - ev, bac - ac);

/** Gross margin % = (Revenue − direct cost) ÷ revenue, as a fraction. */
export const grossMargin = (revenue: number, directCost: number): number | null =>
  ratio(revenue - directCost, revenue);

/**
 * CVR margin amount = value − cost.
 * value = certified + work done not certified + agreed variations + probability-weighted pending items.
 * cost = actual + accruals + provisions.
 */
export function cvrMargin(input: {
  certified: number;
  workDoneNotCertified: number;
  agreedVariations: number;
  probabilityWeightedPending: number;
  actualCost: number;
  accruals: number;
  provisions: number;
}): number {
  const value =
    input.certified + input.workDoneNotCertified + input.agreedVariations + input.probabilityWeightedPending;
  const cost = input.actualCost + input.accruals + input.provisions;
  return value - cost;
}

/** Under/over-billing = revenue earned (by method) − billed. Positive means under-billed. */
export const underOverBilling = (revenueEarned: number, billed: number): number => revenueEarned - billed;

/**
 * Material consumption variance = actual − theoretical,
 * where theoretical = executed quantity × norm × (1 + wastage allowance).
 */
export function materialVariance(input: {
  actualQty: number;
  executedQty: number;
  normPerUnit: number;
  wastageAllowance: number; // fraction, e.g. 0.02 for 2 %
}): number {
  const theoretical = input.executedQty * input.normPerUnit * (1 + input.wastageAllowance);
  return input.actualQty - theoretical;
}

/** Plant utilisation % = working hours ÷ available hours (available = calendar − planned maintenance). */
export function plantUtilisation(workingHours: number, calendarHours: number, plannedMaintenanceHours: number) {
  return ratio(workingHours, calendarHours - plannedMaintenanceHours);
}

/** Plant availability % = (scheduled − breakdown hours) ÷ scheduled hours. */
export const plantAvailability = (scheduledHours: number, breakdownHours: number): number | null =>
  ratio(scheduledHours - breakdownHours, scheduledHours);

/** MTBF = operating hours ÷ failures. */
export const mtbf = (operatingHours: number, failures: number): number | null => ratio(operatingHours, failures);
/** MTTR = repair hours ÷ failures. */
export const mttr = (repairHours: number, failures: number): number | null => ratio(repairHours, failures);

/** Labour productivity index = actual output per man-day ÷ norm. */
export function labourProductivityIndex(outputQty: number, manDays: number, normPerManDay: number): number | null {
  const actualPerManDay = ratio(outputQty, manDays);
  return actualPerManDay === null ? null : ratio(actualPerManDay, normPerManDay);
}

/** DSO = receivables ÷ revenue × days. */
export const dso = (receivables: number, revenue: number, days: number): number | null =>
  ratio(receivables * days, revenue);
/** DPO = payables ÷ purchases × days. */
export const dpo = (payables: number, purchases: number, days: number): number | null =>
  ratio(payables * days, purchases);

/** Certification lag = bill certified date − bill submitted date, in calendar days. */
export function certificationLagDays(submitted: Date, certified: Date): number {
  return Math.round((certified.getTime() - submitted.getTime()) / 86_400_000);
}

// Local calendar date as YYYY-MM-DD, matching how holiday lists are written.
function localIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Working days between two dates, excluding Sundays and any holiday dates supplied (start exclusive, end inclusive). */
export function workingDaysBetween(start: Date, end: Date, holidays: readonly string[] = []): number {
  const holidaySet = new Set(holidays);
  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cursor < last) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() !== 0 && !holidaySet.has(localIsoDate(cursor))) count += 1;
  }
  return count;
}

/** RFI turnaround = response date − raised date, in working days. */
export const rfiTurnaroundDays = (raised: Date, responded: Date, holidays?: readonly string[]) =>
  workingDaysBetween(raised, responded, holidays);

/** LTIFR = lost-time injuries × 1,000,000 ÷ man-hours. */
export const ltifr = (lostTimeInjuries: number, manHours: number): number | null =>
  ratio(lostTimeInjuries * 1_000_000, manHours);
/** TRIFR = total recordable injuries × 1,000,000 ÷ man-hours. */
export const trifr = (recordableInjuries: number, manHours: number): number | null =>
  ratio(recordableInjuries * 1_000_000, manHours);

/** First-time inspection pass % = inspections passed at first attempt ÷ total inspections. */
export const firstTimeInspectionPass = (passedFirstTime: number, total: number): number | null =>
  ratio(passedFirstTime, total);

/** Cost of quality = rework + NCR + testing + inspection cost. */
export const costOfQuality = (c: { rework: number; ncr: number; testing: number; inspection: number }): number =>
  c.rework + c.ncr + c.testing + c.inspection;

/** Vendor OTIF = lines delivered on time in full ÷ lines due. */
export const vendorOtif = (linesOnTimeInFull: number, linesDue: number): number | null =>
  ratio(linesOnTimeInFull, linesDue);

/** Procurement cycle time = PO date − PR approval date, in calendar days. */
export function procurementCycleDays(prApproved: Date, poDate: Date): number {
  return Math.round((poDate.getTime() - prApproved.getTime()) / 86_400_000);
}

/** Unit, format and definition for every B7 KPI. Certified definitions live in the metric catalogue (Part 75). */
export const KPI_DICTIONARY = {
  physicalProgress: { label: "Physical progress", unit: "%", definition: "Σ(weight × activity % complete) by WBS level" },
  spi: { label: "SPI", unit: "ratio", definition: "EV ÷ PV" },
  cpi: { label: "CPI", unit: "ratio", definition: "EV ÷ AC" },
  sv: { label: "Schedule variance", unit: "currency", definition: "EV − PV" },
  cv: { label: "Cost variance", unit: "currency", definition: "EV − AC" },
  eac: { label: "EAC (CPI method)", unit: "currency", definition: "BAC ÷ CPI; comparison only" },
  etc: { label: "ETC", unit: "currency", definition: "EAC − AC" },
  vac: { label: "VAC", unit: "currency", definition: "BAC − EAC" },
  tcpi: { label: "TCPI", unit: "ratio", definition: "(BAC − EV) ÷ (BAC − AC)" },
  grossMargin: { label: "Gross margin", unit: "%", definition: "(Revenue − direct cost) ÷ revenue" },
  cvrMargin: { label: "CVR margin", unit: "currency", definition: "Value − cost, per the CVR definition" },
  underOverBilling: { label: "Under/over-billing", unit: "currency", definition: "Revenue earned − billed" },
  materialVariance: { label: "Material consumption variance", unit: "qty", definition: "Actual − theoretical" },
  plantUtilisation: { label: "Plant utilisation", unit: "%", definition: "Working ÷ (calendar − planned maintenance)" },
  plantAvailability: { label: "Plant availability", unit: "%", definition: "(Scheduled − breakdown) ÷ scheduled" },
  mtbf: { label: "MTBF", unit: "hours", definition: "Operating hours ÷ failures" },
  mttr: { label: "MTTR", unit: "hours", definition: "Repair hours ÷ failures" },
  labourProductivityIndex: { label: "Labour productivity index", unit: "ratio", definition: "Actual output per man-day ÷ norm" },
  dso: { label: "DSO", unit: "days", definition: "Receivables ÷ revenue × days" },
  dpo: { label: "DPO", unit: "days", definition: "Payables ÷ purchases × days" },
  certificationLag: { label: "Certification lag", unit: "days", definition: "Certified date − submitted date" },
  rfiTurnaround: { label: "RFI turnaround", unit: "working days", definition: "Response date − raised date" },
  ltifr: { label: "LTIFR", unit: "per 1,000,000 man-hours", definition: "Lost-time injuries × 1,000,000 ÷ man-hours" },
  trifr: { label: "TRIFR", unit: "per 1,000,000 man-hours", definition: "Recordable injuries × 1,000,000 ÷ man-hours" },
  firstTimeInspectionPass: { label: "First-time inspection pass", unit: "%", definition: "Passed first attempt ÷ total" },
  costOfQuality: { label: "Cost of quality", unit: "currency", definition: "Rework + NCR + testing + inspection" },
  vendorOtif: { label: "Vendor OTIF", unit: "%", definition: "Lines on time in full ÷ lines due" },
  procurementCycleTime: { label: "Procurement cycle time", unit: "days", definition: "PO date − PR approval date" },
} as const;
