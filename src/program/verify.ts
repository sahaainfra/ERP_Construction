// Ordering invariants from Part 00 Annex C3, plus consistency checks on the generated index.
import { PARTS, PHASES, canRunInParallel, getPart, partKey, phaseOf, transitiveDependencies } from "./index";

export interface Violation {
  rule: string;
  detail: string;
}

export function verifyProgram(): Violation[] {
  const violations: Violation[] = [];
  const ids = new Set(PARTS.map((p) => p.id));

  for (const p of PARTS) {
    // C3.1: every dependency has a smaller Part number.
    for (const dep of p.dependsOn) {
      if (!ids.has(dep)) violations.push({ rule: "C3.1", detail: `${p.id} depends on unknown Part ${dep}` });
      else if (partKey(dep) >= partKey(p.id)) violations.push({ rule: "C3.1", detail: `${p.id} depends forward on ${dep}` });
    }
    for (const other of p.parallelWith) {
      if (!ids.has(other)) violations.push({ rule: "parallel", detail: `${p.id} lists unknown parallel Part ${other}` });
    }
    // Consumer links must be mirrored by the consumer's dependency list, unless the list is truncated.
    if (!p.consumedByTruncated) {
      for (const consumer of p.consumedBy) {
        if (!ids.has(consumer)) continue;
        if (!getPart(consumer).dependsOn.includes(p.id)) {
          violations.push({ rule: "consumers", detail: `${p.id} lists ${consumer} as consumer, but ${consumer} does not depend on it` });
        }
      }
    }
  }

  // Each Part's phase must come from the phase table, and the table counts must match the Parts.
  for (const phase of PHASES) {
    const inPhase = PARTS.filter((p) => p.phase === phase.phase);
    if (inPhase.length !== phase.count) {
      violations.push({ rule: "C1", detail: `Phase ${phase.phase} lists ${phase.count} Parts, index has ${inPhase.length}` });
    }
  }
  for (const p of PARTS) {
    const phase = phaseOf(p.id);
    if (phase.phase !== p.phase) violations.push({ rule: "C1", detail: `${p.id} is phase ${p.phase} but its range is phase ${phase.phase}` });
  }

  // C3.4: explicit ordering chains.
  const mustPrecede: [string, string][] = [
    ["38", "39"],
    ["39", "41"],
    ["39", "46"],
    ["60", "61"],
    ["67", "68"],
  ];
  for (const [before, after] of mustPrecede) {
    if (!transitiveDependencies(after).has(before)) {
      violations.push({ rule: "C3.4", detail: `${after} must follow ${before} but has no dependency path` });
    }
  }

  // Parallel pairs must be symmetric and actually independent.
  for (const p of PARTS) {
    for (const other of p.parallelWith) {
      if (!ids.has(other)) continue;
      if (!getPart(other).parallelWith.includes(p.id)) {
        violations.push({ rule: "parallel", detail: `${p.id} lists ${other} as parallel, but not the reverse` });
      }
      if (!canRunInParallel(p.id, other)) {
        violations.push({ rule: "parallel", detail: `${p.id} and ${other} are listed parallel but one depends on the other` });
      }
    }
  }

  return violations;
}
