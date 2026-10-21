// Command queue and base-version rule (Part 14 REQ-FIELD-F08; A-119). Pure rules: the browser keeps the queue in the encrypted vault, and
// the server applies the same base-version check before it accepts a command. A command is applied once, by its UUID.

export type CommandStatus = "queued" | "sent" | "accepted" | "rejected" | "conflict" | "failed";

export interface Command {
  /** UUID, generated on the device. The server processes each UUID at most once. */
  id: string;
  type: string;
  payload: Record<string, unknown>;
  /** The version of each record the person saw when they acted. Keys are record ids, values are versions. */
  baseVersions: Record<string, number>;
  /** Device time, for the record of what the person did. The server stamps its own receipt time. */
  deviceTime: string;
  correlationId: string;
  status: CommandStatus;
  /** Reason given by the server for a rejection, shown to the person. */
  reason?: string;
  /** Times the sync engine has tried and failed to send this command. */
  attempts?: number;
}

export function createCommand(
  input: Omit<Command, "status" | "reason" | "deviceTime"> & { deviceTime?: string },
  now: Date,
): Command {
  if (!input.id || !input.type) throw new RangeError("a command needs an id and a type");
  return { ...input, deviceTime: input.deviceTime ?? now.toISOString(), status: "queued" };
}

/** Adds a command. A command already in the queue (same UUID) is not added twice, so a retry cannot duplicate an action. */
export function enqueue(queue: Command[], command: Command): Command[] {
  return queue.some((c) => c.id === command.id) ? queue : [...queue, command];
}

/** The next command to send, in the order the person made them. Commands already sent or finished are skipped. */
export function nextToSend(queue: Command[]): Command | undefined {
  return queue.find((c) => c.status === "queued");
}

export function settle(
  queue: Command[],
  id: string,
  outcome: { status: "accepted" } | { status: "rejected" | "conflict" | "failed"; reason?: string; attempts?: number },
): Command[] {
  return queue.map((c) => (c.id === id ? { ...c, ...outcome } : c));
}

/**
 * Server-side base-version rule. A command is refused, not applied, when any record it was based on has moved on. Returns the ids
 * that moved, so the person can see which record changed.
 */
export function staleRecords(current: Record<string, number>, base: Record<string, number>): string[] {
  return Object.keys(base).filter((id) => (current[id] ?? 0) !== base[id]);
}
