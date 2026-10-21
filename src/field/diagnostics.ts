// Diagnostics (Part 14 REQ-FIELD-F17, CP-FIELD-05; A-136). A sync log can be exported only with the person's consent. The export keeps
// correlation ids and removes personal and secret-like values with the same redaction rules as the server logs (Part 09).
import { redact } from "../core/logger";
import type { Command } from "./commands";
import { toleranceState } from "./sync";

export interface SyncLogEntry {
  at: string;
  correlationId: string;
  event: string;
  detail: Record<string, unknown>;
}

export function exportSyncLog(entries: SyncLogEntry[], consent: boolean): string {
  if (!consent) throw new Error("the sync log is not exported without the person's consent");
  return JSON.stringify(
    entries.map((e) => ({ at: e.at, correlationId: e.correlationId, event: e.event, detail: redact(e.detail) })),
    null,
    2,
  );
}

/** Telemetry for stale queues and repeated rejections (CP-FIELD-05). Counts only; no record content leaves the device. */
export function queueTelemetry(queue: Command[], now: Date): { queued: number; past72Hours: number; rejected: number; repeatedRejections: number } {
  const rejected = queue.filter((c) => c.status === "rejected");
  const reasons = new Map<string, number>();
  for (const c of rejected) reasons.set(c.reason ?? "", (reasons.get(c.reason ?? "") ?? 0) + 1);
  const queued = queue.filter((c) => c.status === "queued");
  return {
    queued: queued.length,
    past72Hours: queued.filter((c) => toleranceState(c.deviceTime, now) === "past").length,
    rejected: rejected.length,
    repeatedRejections: [...reasons.values()].filter((n) => n >= 3).reduce((a, b) => a + b, 0),
  };
}
