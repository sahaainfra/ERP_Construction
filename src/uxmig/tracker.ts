// Migration tracker (Part 15 REQ-UXMIG-F13; A-141). The stages a screen passes through, and the CSV the repository keeps.
export const STAGES = ["inventoried", "planned", "in_progress", "parity_proven", "piloted", "accepted", "legacy_retired"] as const;
export type Stage = (typeof STAGES)[number];

export interface TrackerRow {
  route: string;
  module: string;
  classification: string;
  stage: Stage;
  parityRef: string;
}

export function nextStage(current: Stage): Stage | null {
  const i = STAGES.indexOf(current);
  return i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

/** A stage is reached only one step at a time, so no screen skips parity or pilot. */
export function advance(row: TrackerRow, to: Stage): TrackerRow {
  if (STAGES.indexOf(to) !== STAGES.indexOf(row.stage) + 1) throw new RangeError(`a screen moves from ${row.stage} to ${nextStage(row.stage) ?? "nothing"} only, not to ${to}`);
  if (to === "parity_proven" && row.parityRef === "") throw new RangeError("a screen cannot be parity-proven without a parity report");
  return { ...row, stage: to };
}

export function trackerCsv(rows: TrackerRow[]): string {
  const header = "route,module,classification,stage,parity_ref";
  const lines = [...rows].sort((a, b) => a.route.localeCompare(b.route)).map((r) => [r.route, r.module, r.classification, r.stage, r.parityRef].map(csv).join(","));
  return [header, ...lines].join("\n") + "\n";
}

function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
