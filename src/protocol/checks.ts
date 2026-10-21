// Check library (Part 17 REQ-PROTOCOL-F03). Each check reads the payload that the calling transaction supplies. A check whose source
// is not built returns UNAVAILABLE with its reason; it never passes silently (A-150 pattern). DUPLICATE and SOD need the database and are
// run by engine.ts; everything else is pure and tested here.
import { evaluateRule, parse } from "./expr";

export const CHECK_KINDS = [
  "PLAN_EXISTS", "BUDGET_AVAILABLE", "STOCK_AVAILABLE", "BALANCE_QTY", "DUPLICATE", "THRESHOLD", "DOCUMENT_REQUIRED", "SOD",
  "CERTIFICATION_VALID", "PERMIT_VALID", "SPEC_APPROVED", "DRAWING_CURRENT", "TIME_WINDOW", "SEQUENCE", "GEO_FENCE", "RECONCILIATION", "CUSTOM",
] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export type CheckOutcome = { status: "ok" } | { status: "fail"; reason: string } | { status: "unavailable"; reason: string } | { status: "database" };

/** Checks whose source is not built yet, with the part that will provide it. */
export const UNAVAILABLE: Partial<Record<CheckKind, string>> = {
  PLAN_EXISTS: "the plan source is not built yet",
  BUDGET_AVAILABLE: "the budget source is not built yet (Part 39 adapter)",
  STOCK_AVAILABLE: "the stock source is not built yet (Part 47)",
  BALANCE_QTY: "the balance source is not built yet (purchase, work order and BOQ balances)",
  CERTIFICATION_VALID: "the certification source is not built yet",
  PERMIT_VALID: "the permit source is not built yet (Part 70)",
  SPEC_APPROVED: "the approved specification source is not built yet",
  DRAWING_CURRENT: "the drawing register is not built yet (Part 34)",
  GEO_FENCE: "the geofence source is not built yet",
};

/** Validates the parameters a control point is proposed with. Refuses a shape the check cannot use. */
export function validateParams(kind: CheckKind, params: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (kind === "THRESHOLD") {
    if (typeof params.field !== "string") problems.push("a threshold needs a field");
    if (params.max === undefined && params.min === undefined) problems.push("a threshold needs a min or a max");
  }
  if (kind === "DOCUMENT_REQUIRED" && !Array.isArray(params.kinds)) problems.push("a document check needs a list of kinds");
  if (kind === "SEQUENCE" && !Array.isArray(params.requires)) problems.push("a sequence check needs a list of stages");
  if (kind === "DUPLICATE" && (!Array.isArray(params.fields) || typeof params.windowHours !== "number")) problems.push("a duplicate check needs fields and a window in hours");
  if (kind === "SOD" && typeof params.action !== "string") problems.push("a segregation check needs the action it covers");
  if (kind === "CUSTOM") {
    if (typeof params.rule !== "string") problems.push("a custom check needs a rule");
    else {
      try {
        // A syntax check only: unknown references read as null, so an empty payload is enough.
        parse(params.rule);
      } catch (e) {
        problems.push(`the rule is not valid: ${(e as Error).message}`);
      }
    }
  }
  return problems;
}

function field(payload: Record<string, unknown>, path: string): unknown {
  let cur: unknown = payload;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** The pure checks. DUPLICATE and SOD are not here: they need the database. */
export function runPureCheck(kind: CheckKind, params: Record<string, unknown>, payload: Record<string, unknown>): CheckOutcome {
  if (kind in UNAVAILABLE) return { status: "unavailable", reason: UNAVAILABLE[kind]! };
  if (kind === "DUPLICATE" || kind === "SOD") return { status: "database" };
  if (kind === "THRESHOLD") {
    const v = field(payload, String(params.field));
    if (typeof v !== "number") return { status: "fail", reason: `${params.field} is missing or not a number` };
    if (typeof params.max === "number" && v > params.max) return { status: "fail", reason: `${params.field} is ${v}, above the limit of ${params.max}` };
    if (typeof params.min === "number" && v < params.min) return { status: "fail", reason: `${params.field} is ${v}, below the limit of ${params.min}` };
    return { status: "ok" };
  }
  if (kind === "DOCUMENT_REQUIRED") {
    const have = new Set(((payload.documents as { kind?: string }[] | undefined) ?? []).map((d) => d.kind));
    const missing = (params.kinds as string[]).filter((k) => !have.has(k));
    return missing.length ? { status: "fail", reason: `missing documents: ${missing.join(", ")}` } : { status: "ok" };
  }
  if (kind === "SEQUENCE") {
    const done = new Set((payload.completedStages as string[] | undefined) ?? []);
    const missing = (params.requires as string[]).filter((s) => !done.has(s));
    return missing.length ? { status: "fail", reason: `earlier stages not complete: ${missing.join(", ")}` } : { status: "ok" };
  }
  if (kind === "TIME_WINDOW") {
    if (typeof params.from === "string" && typeof params.to === "string" && typeof payload.localTime === "string") {
      if (payload.localTime < params.from || payload.localTime > params.to) return { status: "fail", reason: `outside the window ${params.from} to ${params.to}` };
    }
    if (typeof params.maxBackdateDays === "number" && typeof payload.entryDate === "string" && typeof payload.today === "string") {
      const days = (Date.parse(payload.today) - Date.parse(payload.entryDate)) / 86_400_000;
      if (days > params.maxBackdateDays) return { status: "fail", reason: `back-dated by ${days} days, more than the ${params.maxBackdateDays} allowed` };
    }
    return { status: "ok" };
  }
  if (kind === "RECONCILIATION") {
    return payload.periodStatus === "reconciled" ? { status: "ok" } : { status: "fail", reason: "the period is not reconciled" };
  }
  if (kind === "CUSTOM") {
    try {
      return evaluateRule(String(params.rule), payload) ? { status: "ok" } : { status: "fail", reason: String(params.message ?? "the custom rule is not met") };
    } catch (e) {
      return { status: "fail", reason: `the rule could not be evaluated: ${(e as Error).message}` };
    }
  }
  return { status: "unavailable", reason: "this check is not implemented" };
}

/** The fingerprint a DUPLICATE check compares: the chosen payload fields, in a fixed order. */
export function fingerprintOf(fields: string[], payload: Record<string, unknown>): string {
  return fields.map((f) => `${f}=${JSON.stringify(field(payload, f) ?? null)}`).join("|");
}
