// Audit assembly (Part 04 REQ-CICD-F12): npm run erp:audit -- <module code>
// Reads docs/erp-program/modules/<code>/audit-map.json and exits 1 if any AUD dimension lacks a passing evidence file or a reason.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditProblems, type AuditEntry } from "../../src/program/audit";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const code = process.argv[2];
if (!code || !/^[a-z][a-z0-9]*$/.test(code)) {
  console.error("Usage: npm run erp:audit -- <module code>");
  process.exit(2);
}
const mapPath = join(root, "docs/erp-program/modules", code, "audit-map.json");
if (!existsSync(mapPath)) {
  console.error(`No audit map for module ${code}: ${mapPath}`);
  process.exit(1);
}
const { entries } = JSON.parse(readFileSync(mapPath, "utf8")) as { entries: AuditEntry[] };
const problems = auditProblems(entries, (p) => existsSync(join(root, p)));
const counts = { PASS: 0, FAIL: 0, "N/A": 0 };
for (const e of entries) counts[e.result] += 1;
for (const p of problems) console.log(`AUDIT ${p}`);
console.log(`Module ${code}: ${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts["N/A"]} N/A with reason; ${problems.length} problem(s).`);
process.exitCode = problems.length === 0 ? 0 : 1;
