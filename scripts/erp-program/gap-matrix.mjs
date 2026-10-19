// Gap matrix (Part 01 REQ-DISC-F15): one row per Part, from the Annex C index plus the artefacts that exist in
// this repository. Coverage is a category, not a percentage:
//   none           no artefact found for the Part
//   reference-only seed data or formulas exist; no engine, persistence or screens
//   partial        a working slice exists, with gaps listed
//   adopted        documentation adopted; no code
// Run with: node scripts/erp-program/gap-matrix.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const program = JSON.parse(readFileSync(join(root, "src/program/parts.generated.json"), "utf8"));

// Existing artefacts by Part. Paths are repository-relative. Only what this repository contains is listed.
const ARTEFACTS = {
  "00": { coverage: "adopted", paths: ["docs/erp-program/PROGRAM_RULES.md"], note: "Owner signature pending (D-001)" },
  "01": { coverage: "partial", paths: ["docs/erp-program/modules/disc/", "scripts/erp-program/"], note: "Discovery and baseline in progress" },
  "03": { coverage: "reference-only", paths: ["src/program/baseline.ts"], note: "Classifier only; no database" },
  "04": { coverage: "partial", paths: ["src/**/*.test.ts", "scripts/erp-program/baseline.ts"], note: "111 unit tests and baseline check; no CI" },
  "05": { coverage: "reference-only", paths: ["src/domain/numbering.ts"], note: "Numbering seeds and template formatter; no service" },
  "12": { coverage: "partial", paths: ["src/app/", "src/components/shell/", "src/design/", "design/", "scripts/build-tokens.mjs", "scripts/check-design.mjs"], note: "Shell, tokens, nav registry, icons, status chip; no authentication" },
  "13": { coverage: "partial", paths: ["design/navigation-registry.json", "src/app/page.tsx"], note: "Launchpad empty state; no widgets or search" },
  "17": { coverage: "reference-only", paths: ["src/program/conventions.ts"], note: "Control point identifier validator; no protocol engine" },
  "21": { coverage: "reference-only", paths: ["src/domain/uom.ts", "src/domain/roles.ts", "src/domain/structures.ts"], note: "Seed data; no master governance" },
  "22": { coverage: "reference-only", paths: ["src/domain/kpi.ts", "src/domain/commercial.ts", "src/domain/reinforcement.ts", "src/domain/norms.ts"], note: "42 formulas, not an engine; float money (CF-003)" },
  "33": { coverage: "reference-only", paths: ["src/domain/commercial.ts"], note: "BOQ deviation band split" },
  "35": { coverage: "reference-only", paths: ["src/domain/reinforcement.ts"], note: "Bar weight and cut length" },
  "43": { coverage: "reference-only", paths: ["src/domain/kpi.ts"], note: "Earned value indices" },
  "45": { coverage: "reference-only", paths: ["src/domain/norms.ts"], note: "Wastage seeds" },
  "47": { coverage: "reference-only", paths: ["src/domain/norms.ts"], note: "Wastage seeds" },
  "49": { coverage: "reference-only", paths: ["src/domain/norms.ts"], note: "Formwork wear formula (interpretation)" },
  "56": { coverage: "reference-only", paths: ["src/domain/statutory.ts"], note: "Labour statutory seeds, unconfirmed" },
  "61": { coverage: "reference-only", paths: ["src/domain/commercial.ts"], note: "Advances, retention, price variation" },
  "63": { coverage: "reference-only", paths: ["src/domain/commercial.ts"], note: "Liquidated damages, bonus" },
  "67": { coverage: "reference-only", paths: ["src/domain/kpi.ts"], note: "EAC, ETC, VAC, TCPI" },
  "75": { coverage: "reference-only", paths: ["src/domain/kpi.ts"], note: "KPI dictionary; no metric catalogue" },
};
const MODE_OVERRIDE = { "01": "VERIFY & EXTEND" };

const rows = program.parts.map((p) => {
  const entry = ARTEFACTS[p.id] ?? { coverage: "none", paths: [], note: "" };
  return {
    part: p.id,
    title: p.title,
    phase: p.phase,
    defaultMode: p.defaultMode,
    startMode: MODE_OVERRIDE[p.id] ?? p.defaultMode,
    coverage: entry.coverage,
    existingArtefacts: entry.paths.join("; "),
    note: entry.note,
    risk: p.risk,
  };
});

// RFC 4180 quoting for any value containing a comma, quote or newline.
const csv = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const header = ["part", "title", "phase", "risk", "default_mode", "start_mode", "coverage", "existing_artefacts", "note"];
const lines = [header.join(","), ...rows.map((r) => [r.part, r.title, r.phase, r.risk, r.defaultMode, r.startMode, r.coverage, r.existingArtefacts, r.note].map(csv).join(","))];
writeFileSync(join(root, "docs/erp-program/GAP_MATRIX.csv"), lines.join("\n") + "\n");

const tally = {};
for (const r of rows) tally[r.coverage] = (tally[r.coverage] ?? 0) + 1;
console.log(`Gap matrix: ${rows.length} Parts. Coverage: ${JSON.stringify(tally)}.`);
