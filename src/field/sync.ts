// Sync engine (Part 14 REQ-FIELD-F11, F13; A-119, A-132, A-133). Sends the queue in order, in batches. Each command gets its own result,
// so one failing or rejected command never blocks the others. A dropped connection stops the batch and schedules a retry with backoff.
// The transport is injected: the browser build uses fetch, and the tests use a fake server. Events are named here and emitted by the server.
import { settle, type Command } from "./commands";

export interface BackoffPolicy {
  baseMs: number;
  capMs: number;
  maxAttempts: number;
}

/** Documented assumption A-132: the owner may change these values. They are not owner-approved. */
export const SYNC_BACKOFF: BackoffPolicy = { baseMs: 5_000, capMs: 15 * 60_000, maxAttempts: 12 };

/** Full-jitter exponential backoff: a random wait up to the doubled delay, capped. `random` is injected so the schedule is testable. */
export function backoffDelay(attempt: number, policy: BackoffPolicy = SYNC_BACKOFF, random: () => number = Math.random): number {
  if (attempt < 0 || !Number.isInteger(attempt)) throw new RangeError("the attempt must be a whole number from zero");
  const ceiling = Math.min(policy.capMs, policy.baseMs * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

/** Offline tolerance (REQ-FIELD-F11). Commands are kept without loss for this long; after it the person is told to act. A-133. */
export const TOLERANCE_HOURS = 72;

export function toleranceState(queuedAt: string, now: Date, hours: number = TOLERANCE_HOURS): "within" | "past" {
  const queued = Date.parse(queuedAt);
  if (Number.isNaN(queued)) throw new RangeError("the queued time is not a date");
  return (now.getTime() - queued) / 3_600_000 > hours ? "past" : "within";
}

export interface Connection {
  online: boolean;
  /** Network Information API type where the browser exposes it: "wifi", "cellular", and so on. Undefined means unknown. */
  type?: string;
}

/** Whether a transfer may start now. Media on a metered connection waits for Wi-Fi when the person chose Wi-Fi only (REQ-FIELD-F10). */
export function mayTransfer(kind: "command" | "media", connection: Connection, wifiOnly: boolean): boolean {
  if (!connection.online) return false;
  if (kind === "media" && wifiOnly) return connection.type === "wifi" || connection.type === "ethernet";
  return true;
}

export type ItemResult =
  | { id: string; outcome: "accepted" }
  | { id: string; outcome: "rejected"; reason: string }
  | { id: string; outcome: "conflict"; reason: string }
  | { id: string; outcome: "failed"; reason: string };

export interface SyncTransport {
  /** Sends commands in order. May return results for only some of them; the rest stay queued. Throws when the connection drops. */
  sendBatch(commands: Command[]): Promise<ItemResult[]>;
}

export interface SyncRun {
  queue: Command[];
  /** Milliseconds until the next pass, set when something is still waiting to be sent. */
  retryInMs?: number;
  dropped: boolean;
}

/**
 * Runs one sync pass. Each command is tried at most once per pass, so a command that keeps failing cannot hold the pass open. A dropped
 * connection stops the pass at once; the commands still waiting are retried after a backoff delay.
 */
export async function runSync(
  queue: Command[],
  transport: SyncTransport,
  options: { batchSize: number; attempt: number; policy?: BackoffPolicy; random?: () => number },
): Promise<SyncRun> {
  let current = queue;
  const tried = new Set<string>();
  const policy = options.policy ?? SYNC_BACKOFF;
  const retry = () => backoffDelay(options.attempt, policy, options.random);
  const sendable = (c: Command) => c.status === "queued" || (c.status === "failed" && (c.attempts ?? 0) < policy.maxAttempts);
  for (;;) {
    const batch = current.filter((c) => sendable(c) && !tried.has(c.id)).slice(0, options.batchSize);
    if (batch.length === 0) break;
    for (const c of batch) tried.add(c.id);
    let results: ItemResult[];
    try {
      results = await transport.sendBatch(batch);
    } catch {
      return { queue: current, dropped: true, retryInMs: retry() };
    }
    for (const r of results) {
      if (r.outcome === "accepted") {
        current = settle(current, r.id, { status: "accepted" });
      } else {
        const attempts = (current.find((c) => c.id === r.id)?.attempts ?? 0) + 1;
        current = settle(current, r.id, { status: r.outcome, reason: r.reason, attempts });
      }
    }
  }
  // A failed command that used up its attempts waits for a person; it is not retried by the system.
  const waiting = current.some(sendable);
  return { queue: current, dropped: false, retryInMs: waiting ? retry() : undefined };
}

/** The event each outcome produces. The server emits these through the outbox; the device only names them. */
export const FIELD_EVENTS = {
  commandAccepted: "field.command.accepted",
  commandRejected: "field.command.rejected",
  conflictRaised: "field.conflict.raised",
  conflictResolved: "field.conflict.resolved",
} as const;

export function eventFor(result: ItemResult): string | null {
  if (result.outcome === "accepted") return FIELD_EVENTS.commandAccepted;
  if (result.outcome === "rejected") return FIELD_EVENTS.commandRejected;
  if (result.outcome === "conflict") return FIELD_EVENTS.conflictRaised;
  return null;
}
