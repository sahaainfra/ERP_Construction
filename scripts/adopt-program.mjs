// Writes the adoption CSVs from the generated annex data (Part 00 §14 steps 2 and 3):
//   docs/erp-program/LEGACY_CROSSWALK.csv  — one row per old prompt (Annex D5)
//   docs/erp-program/PROGRESS_REGISTER.csv — one row per Part with default mode and legacy evidence (Annex C2 + D2)
// Run with: node scripts/adopt-program.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const program = read("src/program/parts.generated.json");
const legacy = read("src/program/legacy.generated.json");

// RFC 4180 quoting: wrap in quotes when the value holds a comma, quote or newline; double the quotes.
const csv = (value) => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (cells) => cells.map(csv).join(",");

const crosswalkLines = [
  row(["old_prompt", "old_title", "former_id", "legacy_built", "new_parts"]),
  ...legacy.crosswalk.map((r) =>
    row([r.oldPrompt, r.oldTitle, r.formerId ?? "", r.legacyBuilt ? "yes" : "no", r.newParts.join(";")]),
  ),
];
writeFileSync(join(root, "docs/erp-program/LEGACY_CROSSWALK.csv"), crosswalkLines.join("\n") + "\n");

const verifyExtend = new Set(legacy.verifyExtend.map((r) => r.part));
const progressLines = [
  row(["part", "title", "module_code", "phase", "default_mode", "start_mode", "depends_on", "status", "legacy_prompts_built", "evidence"]),
  ...program.parts.map((p) => {
    const builtPrompts = legacy.crosswalk
      .filter((r) => r.legacyBuilt && r.newParts.includes(p.id))
      .map((r) => r.oldPrompt);
    const STATUS = {
      "00": "ADOPTED — owner approved 2026-10-19 (D-025)",
      "01": "APPROVED — owner approved 2026-10-19 (D-025)",
      "02": "APPROVED — document set and ADR-001 to ADR-011, owner 2026-10-19 (D-038)",
      "03": "APPROVED — owner 2026-10-19 (D-033); PITR, ACP, legacy, masking deferred (CF-016)",
      "04": "APPROVED — owner 2026-10-19 (D-036); deployment, rollback and metrics deferred (CF-021); branch protection open (CF-022)",
      "06": "APPROVED — owner 2026-10-20 (D-043) for slice S1; slice S2 approved (D-045); slices S3–S5 built and approved for the built scope (D-046); RACI and routes open; independent review open (Part 00 §5.8)",
      "07": "DRAFTED — slices S2 and S3 APPROVED (D-048, D-050); S1, S4, S5 built (D-051), approval pending; identity provider unnamed (CF-013); independent review open",
      "05": "APPROVED — owner 2026-10-19 (D-037); Redis, object storage and remaining items deferred (CF-027, CF-028)",
    };
    const status = STATUS[p.id] ?? "NOT_STARTED";
    return row([
      p.id,
      p.title,
      p.code,
      p.phase,
      p.defaultMode,
      verifyExtend.has(p.id) ? "VERIFY & EXTEND" : p.defaultMode,
      p.dependsOn.join(";"),
      status,
      builtPrompts.join(";"),
      // Legacy evidence paths named in §14 (test-evidence/part-NNN, audit/part-NNN.md) are not in this repository.
      builtPrompts.length > 0 ? "legacy evidence not in repository" : "",
    ]);
  }),
];
writeFileSync(join(root, "docs/erp-program/PROGRESS_REGISTER.csv"), progressLines.join("\n") + "\n");

console.log(`Wrote LEGACY_CROSSWALK.csv (${legacy.crosswalk.length} rows) and PROGRESS_REGISTER.csv (${program.parts.length} rows).`);
