// Conflict framework (Part 14 REQ-FIELD-F12; A-120). The server is authoritative. A conflict is never resolved by the system: each entity
// registers its rule, and a person chooses between the server version and the local version, side by side. A locked record (for example
// an approved DPR) cannot be overwritten; "keep mine" there creates an amendment request instead.

export interface ConflictRule {
  /** True when the record is locked: approved, posted or otherwise closed to direct change. */
  locked: (serverVersion: Record<string, unknown>) => boolean;
}

const rules = new Map<string, ConflictRule>();

export function registerConflictRule(entity: string, rule: ConflictRule): void {
  rules.set(entity, rule);
}

/** An unregistered entity has no rule, so its conflicts are refused rather than guessed. */
export function ruleFor(entity: string): ConflictRule {
  const rule = rules.get(entity);
  if (!rule) throw new RangeError(`no conflict rule is registered for ${entity}`);
  return rule;
}

export interface Conflict {
  id: string;
  entity: string;
  entityId: string;
  serverVersion: Record<string, unknown>;
  localVersion: Record<string, unknown>;
  /** Version the server holds now, and the version the person based the change on. */
  serverRecordVersion: number;
  baseRecordVersion: number;
}

export type Choice = "keep_server" | "keep_mine";

export type Outcome =
  | { action: "use_server" }
  | { action: "apply_local"; baseRecordVersion: number }
  | { action: "amendment_request"; reason: string };

/** Decides what a person's choice does. The framework never resolves a conflict on its own: every conflict waits for a person's choice (A-120). A locked record never takes the local version directly. */
export function resolveConflict(conflict: Conflict, choice: Choice): Outcome {
  if (choice === "keep_server") return { action: "use_server" };
  if (ruleFor(conflict.entity).locked(conflict.serverVersion)) {
    return { action: "amendment_request", reason: "the record is locked; the change is raised as an amendment for approval" };
  }
  // Unlocked: the person's change is re-based on the current server version, so it does not overwrite anything they have not seen.
  return { action: "apply_local", baseRecordVersion: conflict.serverRecordVersion };
}
