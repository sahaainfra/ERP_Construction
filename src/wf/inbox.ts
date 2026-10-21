// My Inbox and bulk approval (Part 16 REQ-WF-F12, CP-WF-03; A-159). Lists the open steps the signed-in person holds, directly or through a
// delegation. Each item carries its risk flags. A flag whose source is not built yet is shown as "unavailable", never left out (A-150).
export interface InboxItem {
  taskId: number;
  instanceId: number;
  docType: string;
  docId: string;
  step: string;
  amountPaise: number | null;
  submittedBy: string;
  emergency: boolean;
  dueAt: string | null;
  slaState: "running" | "reminder_50" | "reminder_90" | "expired" | "none";
  /** True when the signed-in person is acting for someone else on this step. */
  delegatedFrom: string | null;
  /** An enforced segregation conflict for the viewer on this document. A preview: the approval action checks it again. */
  sodWarning: boolean;
  /** Earlier orders with the same split key inside the window (DR-13 is checked on approval, against the band). */
  splitFinding: boolean;
}

export const UNAVAILABLE_SOURCES = ["budget overrun", "rate above benchmark", "open exception", "duplicate risk", "superseded drawing"] as const;

export type RiskFlag = "sla_expired" | "sla_reminder" | "emergency" | "sod_warning" | "split_finding" | `unavailable:${(typeof UNAVAILABLE_SOURCES)[number]}`;

/** The flags an item shows, in a fixed order. Sources not built yet appear as unavailable. */
export function riskFlags(item: InboxItem): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (item.slaState === "expired") flags.push("sla_expired");
  else if (item.slaState === "reminder_50" || item.slaState === "reminder_90") flags.push("sla_reminder");
  if (item.emergency) flags.push("emergency");
  if (item.sodWarning) flags.push("sod_warning");
  if (item.splitFinding) flags.push("split_finding");
  for (const source of UNAVAILABLE_SOURCES) flags.push(`unavailable:${source}`);
  return flags;
}

/**
 * Whether the items can be approved together (CP-WF-03). Refused unless a bulk limit has been set by the owner (§2.9), every item is the
 * same document type and under that limit, and no item carries a warning, an exception or an unavailable check. Returns the reasons for any refusal.
 */
export function bulkEligible(items: InboxItem[], bulkLimitPaise: number | null, flagsOf: (i: InboxItem) => RiskFlag[] = riskFlags): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (bulkLimitPaise === null) return { allowed: false, reasons: ["bulk approval is off until the owner sets its limit"] };
  if (items.length === 0) return { allowed: false, reasons: ["no items selected"] };
  if (new Set(items.map((i) => i.docType)).size > 1) reasons.push("items must be of one document type");
  if (items.some((i) => i.amountPaise === null || i.amountPaise > bulkLimitPaise)) reasons.push("an item is above the bulk limit or has no amount");
  // An unavailable source is not a clean result: an item whose budget or benchmark cannot be checked is not approved in bulk.
  if (items.some((i) => flagsOf(i).length > 0 || i.sodWarning || i.splitFinding)) {
    reasons.push("an item carries a warning, an exception or an unavailable check");
  }
  if (items.some((i) => i.emergency)) reasons.push("an emergency approval cannot be approved in bulk");
  return { allowed: reasons.length === 0, reasons };
}
