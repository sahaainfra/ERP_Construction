// Legacy adapter (Part 16 REQ-WF-F16; A-146). Legacy statuses are mirrored read-only into the workflow view, so the inbox can show them.
// A status with no mapping is shown as "unmapped", never hidden.
export interface MirroredStatus {
  legacyStatus: string;
  state: string;
  readOnly: true;
}

export function mirrorLegacy(legacyStatus: string, map: Record<string, string>): MirroredStatus {
  return { legacyStatus, state: map[legacyStatus] ?? "unmapped", readOnly: true };
}
