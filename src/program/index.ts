// Program index and execution order from Part 00 Annex C.
// Data is generated from docs/program/annex-c-master-index.md by scripts/build-program-index.mjs.

import data from "./parts.generated.json";

export interface PartRecord {
  id: string;
  title: string;
  code: string;
  phase: number;
  risk: string;
  defaultMode: string;
  dependsOn: string[];
  consumedBy: string[];
  /** The annex truncates some consumer lists with "…"; the list is then a partial view. */
  consumedByTruncated: boolean;
  parallelWith: string[];
}

export interface PhaseRecord {
  phase: number;
  name: string;
  first: string;
  last: string;
  count: number;
}

export const PHASES: readonly PhaseRecord[] = data.phases;
export const PARTS: readonly PartRecord[] = data.parts;

const byId = new Map(PARTS.map((p) => [p.id, p]));

/** Sort key that keeps lettered Parts between their number and the next one: 08 < 08A < 09. */
export function partKey(id: string): number {
  const match = id.match(/^(\d{2})([A-C])?$/);
  if (!match) throw new RangeError(`Not a Part id: ${id}`);
  const suffix = match[2] ? match[2].charCodeAt(0) - 64 : 0;
  return Number(match[1]) * 100 + suffix;
}

export function getPart(id: string): PartRecord {
  const part = byId.get(id);
  if (!part) throw new RangeError(`Unknown Part ${id}`);
  return part;
}

/** Every Part this one depends on, directly or through others. */
export function transitiveDependencies(id: string): Set<string> {
  const found = new Set<string>();
  const stack = [...getPart(id).dependsOn];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (found.has(next)) continue;
    found.add(next);
    stack.push(...getPart(next).dependsOn);
  }
  return found;
}

/** Annex C: a Part starts only when every Part in "Depends on" is APPROVED. */
export function canStart(id: string, approved: ReadonlySet<string>): boolean {
  return getPart(id).dependsOn.every((dep) => approved.has(dep));
}

/** Parts that are not yet approved or running, and whose dependencies are all approved, in execution order. */
export function runnableNow(approved: ReadonlySet<string>, inProgress: ReadonlySet<string> = new Set()): PartRecord[] {
  return [...PARTS]
    .filter((p) => !approved.has(p.id) && !inProgress.has(p.id) && canStart(p.id, approved))
    .sort((a, b) => partKey(a.id) - partKey(b.id));
}

/**
 * Two Parts may run in parallel when the annex lists them as parallel and neither depends on the other,
 * directly or through a chain. Parallel work still needs separate feature flags and branches (Annex C).
 */
export function canRunInParallel(a: string, b: string): boolean {
  if (!getPart(a).parallelWith.includes(b)) return false;
  return !transitiveDependencies(a).has(b) && !transitiveDependencies(b).has(a);
}

/** Phase for a Part, taken from the annex phase table by Part number. */
export function phaseOf(id: string): PhaseRecord {
  const key = partKey(id);
  const found = PHASES.find((ph) => key >= partKey(ph.first) && key <= partKey(ph.last) + 99);
  if (!found) throw new RangeError(`No phase covers ${id}`);
  return found;
}
