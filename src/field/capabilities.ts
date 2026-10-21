// Offline-capability registry (Part 14 REQ-FIELD-F16; A-135). Each module and command type says whether it may be queued offline.
// The default is online-only: an unknown command type is refused offline. The online-only list is the proposal in §2.6 and is not yet
// confirmed by the owner, so it is recorded as an assumption (A-135) and easy to change in one place.

export interface CapabilityEntry {
  module: string;
  commandType: string;
  offline: boolean;
  /** Why the command is online-only, shown to the person when refused. */
  reason?: string;
}

export const CAPABILITIES: CapabilityEntry[] = [
  { module: "dpr", commandType: "dpr.line.add", offline: true },
  { module: "attendance", commandType: "punch.record", offline: true },
  { module: "inspection", commandType: "inspection.item.record", offline: true },
  { module: "issue", commandType: "issue.raise", offline: true },
  { module: "approvals", commandType: "approval.decide", offline: false, reason: "approvals with financial impact are decided online" },
  { module: "finance", commandType: "payment.release", offline: false, reason: "payments are released online only" },
  { module: "procurement", commandType: "po.release", offline: false, reason: "purchase orders are released online only" },
  { module: "stock", commandType: "stock.post", offline: false, reason: "stock posting is confirmed online" },
  { module: "master", commandType: "master.change", offline: false, reason: "master data changes are made online" },
  { module: "iam", commandType: "permission.change", offline: false, reason: "permission changes are made online" },
];

/** Returns whether a command may be queued offline. Unknown command types are refused, never guessed. */
export function offlineAllowed(commandType: string, registry: CapabilityEntry[] = CAPABILITIES): { allowed: true } | { allowed: false; reason: string } {
  const entry = registry.find((e) => e.commandType === commandType);
  if (!entry) return { allowed: false, reason: "this action is not registered for offline use" };
  if (!entry.offline) return { allowed: false, reason: entry.reason ?? "this action needs a connection" };
  return { allowed: true };
}
