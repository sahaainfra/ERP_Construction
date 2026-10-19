// Baseline comparison (Part 01 REQ-DISC-F13). Pure functions: the CLI reads files and passes snapshots in.
// Classification follows the Part 01 acceptance rule: removals and changed outputs are destructive;
// additions are additive; changed artefact content is reported for review.

export interface Snapshot {
  /** Artefact path → sha256 of its content. */
  artifacts: Record<string, string>;
  /** Golden case id → recorded output. */
  cases: Record<string, unknown>;
}

export type DifferenceKind = "destructive" | "changed" | "additive";

export interface Difference {
  kind: DifferenceKind;
  key: string;
  detail: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function classify(baseline: Snapshot, current: Snapshot): Difference[] {
  const found: Difference[] = [];

  for (const [path, hash] of Object.entries(baseline.artifacts)) {
    if (!(path in current.artifacts)) found.push({ kind: "destructive", key: path, detail: "artefact removed" });
    else if (current.artifacts[path] !== hash) found.push({ kind: "changed", key: path, detail: "content changed; review" });
  }
  for (const path of Object.keys(current.artifacts)) {
    if (!(path in baseline.artifacts)) found.push({ kind: "additive", key: path, detail: "artefact added" });
  }

  for (const [id, value] of Object.entries(baseline.cases)) {
    if (!(id in current.cases)) found.push({ kind: "destructive", key: id, detail: "golden case removed" });
    else if (!same(value, current.cases[id])) {
      found.push({ kind: "destructive", key: id, detail: `golden output changed (N4: never silently change a number): ${JSON.stringify(value)} → ${JSON.stringify(current.cases[id])}` });
    }
  }
  for (const id of Object.keys(current.cases)) {
    if (!(id in baseline.cases)) found.push({ kind: "additive", key: id, detail: "golden case added" });
  }

  return found.sort((a, b) => (a.kind + a.key).localeCompare(b.kind + b.key));
}

/** Exit status for the check: 1 when any destructive difference exists, otherwise 0. */
export function exitCode(differences: readonly Difference[]): number {
  return differences.some((d) => d.kind === "destructive") ? 1 : 0;
}
