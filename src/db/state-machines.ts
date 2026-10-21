// State machines from Part 03 §6. Pure: each function checks a transition and returns the next state or throws.
// State names match the database values where a table stores them (sys.acp_runs, sys.legacy_loads).

export interface Machine<S extends string> {
  name: string;
  initial: S;
  transitions: Readonly<Record<S, readonly S[]>>;
  /** States from which any step may move to the given state (for example ROLLED_BACK). */
  from_any?: readonly S[];
  terminal?: readonly S[];
}

export function canTransition<S extends string>(machine: Machine<S>, from: S, to: S): boolean {
  if (machine.from_any?.includes(to)) return true;
  return (machine.transitions[from] ?? []).includes(to);
}

export function transition<S extends string>(machine: Machine<S>, from: S, to: S): S {
  if (!canTransition(machine, from, to)) {
    throw new RangeError(`${machine.name}: transition ${from} → ${to} is not allowed`);
  }
  return to;
}

export const MIGRATION_MACHINE = {
  name: "migration",
  initial: "DRAFTED",
  transitions: {
    DRAFTED: ["REVIEWED"],
    REVIEWED: ["APPROVED"],
    APPROVED: ["DRY_RUN_PASSED"],
    DRY_RUN_PASSED: ["APPLIED"],
    APPLIED: ["VERIFIED"],
    VERIFIED: [],
    ROLLED_BACK: [],
  },
  from_any: ["ROLLED_BACK"],
  terminal: ["VERIFIED", "ROLLED_BACK"],
} as const satisfies Machine<string>;

export const BACKFILL_MACHINE = {
  name: "backfill",
  initial: "PLANNED",
  transitions: {
    PLANNED: ["DRY_RUN"],
    DRY_RUN: ["RUNNING", "STOPPED"],
    RUNNING: ["PAUSED", "RECONCILED", "STOPPED"],
    PAUSED: ["RUNNING", "STOPPED"],
    RECONCILED: ["COMPLETED"],
    COMPLETED: [],
    STOPPED: [],
  },
  terminal: ["COMPLETED", "STOPPED"],
} as const satisfies Machine<string>;

export const ACP_MACHINE = {
  name: "acp",
  initial: "adr_approved",
  transitions: {
    adr_approved: ["expanded"],
    expanded: ["migrating"],
    migrating: ["parallel_run"],
    parallel_run: ["cutover_ready"],
    cutover_ready: ["cut_over"],
    cut_over: ["stability_window"],
    stability_window: ["contracted"],
    contracted: [],
    rolled_back: [],
  },
  from_any: ["rolled_back"],
  terminal: ["contracted", "rolled_back"],
} as const satisfies Machine<string>;

export const LEGACY_LOAD_MACHINE = {
  name: "legacy-load",
  initial: "mapped",
  transitions: {
    mapped: ["staged"],
    staged: ["validated"],
    validated: ["reconciled"],
    reconciled: ["owner_signed_off"],
    owner_signed_off: ["loaded"],
    loaded: ["verified"],
    verified: [],
  },
  terminal: ["verified"],
} as const satisfies Machine<string>;

export const INDEX_MACHINE = {
  name: "index-on-existing-table",
  initial: "PROPOSED",
  transitions: {
    PROPOSED: ["PLAN_EVIDENCE"],
    PLAN_EVIDENCE: ["DBA_APPROVED"],
    DBA_APPROVED: ["APPLIED"],
    APPLIED: ["VERIFIED"],
    VERIFIED: [],
  },
  terminal: ["VERIFIED"],
} as const satisfies Machine<string>;
