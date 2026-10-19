// Audit assembly (Part 04 REQ-CICD-F12; Part 00 §5.8). Every AUD dimension needs a passing evidence file or a stated N/A reason.

export const AUD_DIMENSIONS = [
  "AUD-1 functional", "AUD-2 UI/UX consistency", "AUD-3 theme/dashboard", "AUD-4 navigation", "AUD-5 database",
  "AUD-6 API/events", "AUD-7 permissions/SoD", "AUD-8 workflow & controls", "AUD-9 validations", "AUD-10 reports",
  "AUD-11 notifications", "AUD-12 integrations & adapters", "AUD-13 responsive/offline", "AUD-14 security",
  "AUD-15 performance", "AUD-16 error handling", "AUD-17 regression", "AUD-18 build/deploy/rollback",
] as const;

export interface AuditEntry {
  dimension: string;
  result: "PASS" | "FAIL" | "N/A";
  evidence?: string;
  reason?: string;
}

export function auditProblems(entries: AuditEntry[], exists: (path: string) => boolean): string[] {
  const problems: string[] = [];
  for (const dim of AUD_DIMENSIONS) {
    const e = entries.find((x) => x.dimension === dim);
    if (!e) {
      problems.push(`${dim}: no entry`);
      continue;
    }
    if (e.result === "FAIL") problems.push(`${dim}: FAIL`);
    if (e.result === "PASS" && (!e.evidence || !exists(e.evidence))) problems.push(`${dim}: PASS without an existing evidence file`);
    if (e.result === "N/A" && (!e.reason || e.reason.trim().length < 20)) problems.push(`${dim}: N/A needs a reason of at least 20 characters`);
  }
  return problems;
}
