// Amendments (Part 16 REQ-WF-F09; A-148). An approved record is locked. A change starts a new instance that keeps a link to the one it
// amends and a summary of what changed. The summary is computed from the two versions, never typed in.
export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export function changesOf(before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ field: k, before: before[k], after: after[k] }));
}
