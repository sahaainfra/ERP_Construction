// Status model (Part 14 REQ-FIELD-F13). Each record and the whole device show one of six states. The worst state wins for the device.
export type SyncState = "offline" | "queued" | "syncing" | "synced" | "conflict" | "failed";

/** Worst first. A conflict or a failure always shows above normal progress. */
const SEVERITY: SyncState[] = ["conflict", "failed", "syncing", "offline", "queued", "synced"];

export function recordStatus(input: { online: boolean; commandStatuses: string[] }): SyncState {
  const s = input.commandStatuses;
  if (s.includes("conflict")) return "conflict";
  if (s.includes("failed")) return "failed";
  if (s.includes("sent")) return "syncing";
  if (s.includes("queued")) return input.online ? "queued" : "offline";
  return "synced";
}

export function globalStatus(states: SyncState[]): SyncState {
  if (states.length === 0) return "synced";
  return SEVERITY.find((level) => states.includes(level)) ?? "synced";
}
