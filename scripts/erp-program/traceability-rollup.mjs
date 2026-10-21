// Rolls every module traceability.csv into docs/erp-program/TRACEABILITY_MATRIX.csv (Part 04 REQ-CICD-F12).
// Run with: node scripts/erp-program/traceability-rollup.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modulesDir = join(root, "docs/erp-program/modules");
const rows = [];
for (const code of readdirSync(modulesDir).sort()) {
  const file = join(modulesDir, code, "traceability.csv");
  if (!existsSync(file)) continue;
  const [header, ...body] = readFileSync(file, "utf8").trimEnd().split("\n");
  const columns = header.split(",");
  for (const line of body) {
    const cells = line.split(",");
    const row = Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? ""]));
    rows.push([code, row.req_id, row.requirement, row.status, row.evidence, row.note].map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","));
  }
}
writeFileSync(join(root, "docs/erp-program/TRACEABILITY_MATRIX.csv"), ["module,req_id,requirement,status,evidence,note", ...rows].join("\n") + "\n");
console.log(`Rolled up ${rows.length} requirement rows from ${readdirSync(modulesDir).length} module folder(s).`);
