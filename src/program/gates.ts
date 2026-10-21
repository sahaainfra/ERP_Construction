// Quality-gate configuration and evaluation (Part 04 REQ-CICD-F02, REQ-CICD-F14; CP-CICD-01, CP-CICD-03).
// Thresholds are never lowered silently: a lowered threshold needs a reason, an expiry and two approvers (state DRAFT → APPROVED → ACTIVE).

export interface Threshold {
  name: string;
  value: number;
  /** "min": the measured value must be ≥ value. "max": it must be ≤ value. */
  direction: "min" | "max";
  reason: string;
}

export interface GateConfig {
  thresholds: Threshold[];
  mandatoryGates: string[];
}

export interface QuarantineEntry {
  test: string;
  reason: string;
  owner: string;
  expires_at: string;
}

export function evaluateThresholds(config: GateConfig, measured: Record<string, number>): { name: string; ok: boolean; measured: number | undefined }[] {
  return config.thresholds.map((t) => {
    const value = measured[t.name];
    const ok = value === undefined ? false : t.direction === "min" ? value >= t.value : value <= t.value;
    return { name: t.name, ok, measured: value };
  });
}

/** Maker-checker for thresholds: a lower bar (weaker min or higher max) needs a change record with two approvers. */
export function loweredThresholds(before: GateConfig, after: GateConfig, approvals: Record<string, string[]>): string[] {
  const problems: string[] = [];
  for (const a of after.thresholds) {
    const b = before.thresholds.find((t) => t.name === a.name);
    if (!b) continue;
    const lowered = a.direction === "min" ? a.value < b.value : a.value > b.value;
    if (!lowered) continue;
    if (!a.reason || a.reason.trim().length < 20) problems.push(`${a.name}: lowering needs a reason of at least 20 characters`);
    if ((approvals[a.name] ?? []).length < 2) problems.push(`${a.name}: lowering needs two approvers`);
  }
  return problems;
}

/** Quarantined tests: expired entries fail the gate; entries without an owner or expiry are invalid. */
export function quarantineProblems(entries: QuarantineEntry[], today: Date): string[] {
  const problems: string[] = [];
  for (const e of entries) {
    if (!e.owner) problems.push(`${e.test}: quarantine needs an owner`);
    const expires = new Date(e.expires_at);
    if (Number.isNaN(expires.getTime())) problems.push(`${e.test}: expires_at is not a date`);
    else if (expires < today) problems.push(`${e.test}: quarantine expired on ${e.expires_at}`);
  }
  return problems;
}

/** CP-CICD-01: every mandatory gate must be green. A missing result counts as not green. */
export function failingGates(config: GateConfig, results: Record<string, "pass" | "fail" | "skipped">): string[] {
  return config.mandatoryGates.filter((g) => results[g] !== "pass");
}
