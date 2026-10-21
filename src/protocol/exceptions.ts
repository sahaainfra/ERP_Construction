// Exceptions, emergency path, matrix, thresholds, evidence and reason codes (Part 17 REQ-PROTOCOL-F05 to F09; Part 00 §9.3 to §9.5). Pure rules.
// Seeds are the program defaults. Each one is a seed for the owner to confirm (discovery §2.2), and a threshold is never used before it is active.
export const EXCEPTION_TYPES = [
  "QTY_OVER_PLAN", "BUDGET_OVERRUN", "SCHEDULE_DEVIATION", "SPEC_DEVIATION", "PROCESS_DEVIATION", "EXCESS_CONSUMPTION", "EMERGENCY_PURCHASE",
  "SINGLE_SOURCE", "NON_L1_SELECTION", "BACK_DATED_ENTRY", "CANCELLATION", "REVERSAL", "MODIFICATION_AFTER_APPROVAL", "UNPLANNED_WORK",
  "OVERTIME_EXCESS", "IDLE_RESOURCE_RETENTION", "DOCUMENT_WAIVER", "RATE_ABOVE_BENCHMARK", "CREDIT_LIMIT", "PAYMENT_PRIORITY_OVERRIDE",
] as const;

export const NARRATIVE_MIN = 20;
export const OTHER_NARRATIVE_MIN = 50;
/** Emergency regularisation window in hours (A-161; Part 00 §9.3 default). */
export const EMERGENCY_WINDOW_HOURS = 24;

/** Seed matrix (Part 00 §9.3): up to 5 % → PM; 5 to 10 % → PM and Cost Controller; above 10 % or above ₹5 lakh → Management. */
export const SEED_MATRIX_LIMIT_PAISE = 50_000_000;
export type Band = "PM" | "PM_COST" | "MANAGEMENT";
export function matrixBand(variancePct: number, amountPaise: number): Band {
  if (variancePct > 10 || amountPaise > SEED_MATRIX_LIMIT_PAISE) return "MANAGEMENT";
  if (variancePct > 5) return "PM_COST";
  return "PM";
}

/** The narrative must meet its minimum: 20 characters, or 50 for "Other" (reported separately). */
export function narrativeProblem(code: string, narrative: string): string | null {
  const min = code === "OTHER" ? OTHER_NARRATIVE_MIN : NARRATIVE_MIN;
  return narrative.trim().length >= min ? null : `the narrative needs at least ${min} characters${code === "OTHER" ? " for Other" : ""}`;
}

export type Validity = "SINGLE_USE" | "UNTIL_DATE" | "QUANTITY_CAP";
export interface ApprovedException {
  status: string;
  validity: Validity;
  cap: number | null;
  consumed: number;
  validUntil: string | null;
}

/** Whether an approved exception covers a quantity now, and what it leaves. Refuses a second use of a single-use exception. */
export function consumable(exc: ApprovedException, qty: number, today: string): { ok: true; consumed: number; status: string } | { ok: false; reason: string } {
  if (exc.validity === "SINGLE_USE" && exc.consumed > 0) return { ok: false, reason: "this single-use exception was already used" };
  if (exc.status !== "APPROVED") return { ok: false, reason: `the exception is ${exc.status.toLowerCase()}, not approved` };
  if (exc.validUntil !== null && today > exc.validUntil) return { ok: false, reason: "the exception has expired" };
  if (!(qty > 0)) return { ok: false, reason: "the quantity used must be above zero" };
  if (exc.validity === "SINGLE_USE") {
    if (exc.consumed > 0) return { ok: false, reason: "this single-use exception was already used" };
    if (exc.cap !== null && qty > exc.cap) return { ok: false, reason: `the exception covers ${exc.cap}, not ${qty}` };
    return { ok: true, consumed: qty, status: "CONSUMED" };
  }
  const cap = exc.cap ?? Infinity;
  if (exc.consumed + qty > cap) return { ok: false, reason: `only ${cap - exc.consumed} remains of the approved ${cap}` };
  const next = exc.consumed + qty;
  return { ok: true, consumed: next, status: next >= cap && exc.cap !== null ? "CONSUMED" : "APPROVED" };
}

export type EmergencyState = "regularised" | "pending" | "overdue";
/** Regularisation: pending inside the window, overdue after it (escalated to L3, CP-PROTOCOL-04). */
export function emergencyState(dueAt: Date, regularisedAt: Date | null, now: Date): EmergencyState {
  if (regularisedAt) return "regularised";
  return now.getTime() > dueAt.getTime() ? "overdue" : "pending";
}

export function emergencyDue(startedAt: Date): Date {
  return new Date(startedAt.getTime() + EMERGENCY_WINDOW_HOURS * 3_600_000);
}

export interface EvidenceRule { itemType: "photo" | "document" | "field" | "signature" | "gps"; minCount: number }
export interface EvidenceItem { type: string }
/** The evidence still missing for a set of rules. An empty list means the evidence is complete. */
export function evidenceMissing(rules: EvidenceRule[], items: EvidenceItem[]): string[] {
  return rules
    .map((r) => ({ r, have: items.filter((i) => i.type === r.itemType).length }))
    .filter((x) => x.have < x.r.minCount)
    .map((x) => `${x.r.itemType}: ${x.r.minCount - x.have} more needed`);
}

export interface ThresholdRow { key: string; scopeType: "COMPANY" | "PROJECT_TYPE" | "PROJECT" | "MATERIAL_GROUP"; scopeId: string; value: number; effectiveFrom: string; effectiveTo: string | null }
const SPECIFICITY: Record<ThresholdRow["scopeType"], number> = { COMPANY: 0, PROJECT_TYPE: 1, PROJECT: 2, MATERIAL_GROUP: 3 };
/** The active threshold for a key, date and scope: the most specific effective row wins. Returns null rather than a default value. */
export function thresholdAt(rows: ThresholdRow[], key: string, date: string, scope: { projectTypeId?: string; projectId?: string; materialGroupId?: string; companyId: string }): number | null {
  const applicable = rows.filter((r) => r.key === key && r.effectiveFrom <= date && (r.effectiveTo === null || r.effectiveTo >= date) && matches(r, scope));
  if (applicable.length === 0) return null;
  // The most specific scope wins; within one scope the row that took effect most recently wins.
  applicable.sort((a, b) => SPECIFICITY[b.scopeType] - SPECIFICITY[a.scopeType] || b.effectiveFrom.localeCompare(a.effectiveFrom));
  return applicable[0].value;
}
function matches(r: ThresholdRow, scope: { projectTypeId?: string; projectId?: string; materialGroupId?: string; companyId: string }): boolean {
  if (r.scopeType === "COMPANY") return r.scopeId === scope.companyId;
  if (r.scopeType === "PROJECT_TYPE") return r.scopeId === scope.projectTypeId;
  if (r.scopeType === "PROJECT") return r.scopeId === scope.projectId;
  return r.scopeId === scope.materialGroupId;
}

/** Seed threshold keys and values (Part 00 §9.4). Owner confirms them before they are activated (discovery §2.2). Not active until then. */
export const SEED_THRESHOLDS: Record<string, number> = {
  "budget.warn_pct": 90, "budget.block_pct": 100, "material.issue_over_plan_pct": 0, "grn.over_receipt_pct": 2, "price.variance_pct": 5,
  "schedule.slip_days_warn": 3, "schedule.slip_days_escalate": 7, "labour.productivity_min_pct": 80, "labour.ot_max_pct": 10,
  "plant.utilisation_min_pct": 60, "plant.fuel_variance_pct": 15, "duplicate.window_days": 30, "tool.custody_overdue_days": 7,
};
