// Golden baseline capture and check (Part 01 REQ-DISC-F12, F13).
//   npm run baseline:capture   writes docs/erp-program/GOLDEN_OUTPUTS/baseline.json
//   npm run baseline:check     compares the repository with the baseline; exit 1 on destructive differences
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ARTIFACTS, goldenCases } from "../../src/program/golden";
import { classify, exitCode, type Snapshot } from "../../src/program/baseline";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baselinePath = join(root, "docs/erp-program/GOLDEN_OUTPUTS/baseline.json");

export function snapshot(): Snapshot {
  const artifacts: Record<string, string> = {};
  for (const path of ARTIFACTS) {
    const full = join(root, path);
    artifacts[path] = existsSync(full) ? createHash("sha256").update(readFileSync(full)).digest("hex") : "MISSING";
  }
  const cases = goldenCases();
  return { artifacts, cases };
}

const mode = process.argv[2];
if (mode === "capture") {
  const snap = snapshot();
  const missing = Object.entries(snap.artifacts).filter(([, h]) => h === "MISSING").map(([p]) => p);
  if (missing.length > 0) {
    console.error(`Cannot capture: missing artefacts: ${missing.join(", ")}`);
    process.exit(1);
  }
  writeFileSync(baselinePath, JSON.stringify(snap, null, 2) + "\n");
  console.log(`Captured ${Object.keys(snap.cases).length} golden cases and ${Object.keys(snap.artifacts).length} artefacts.`);
} else if (mode === "check") {
  if (!existsSync(baselinePath)) {
    console.error("No baseline captured. Run: npm run baseline:capture");
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Snapshot;
  const differences = classify(baseline, snapshot());
  for (const d of differences) console.log(`${d.kind.toUpperCase().padEnd(11)} ${d.key} — ${d.detail}`);
  const counts = { destructive: 0, changed: 0, additive: 0 };
  for (const d of differences) counts[d.kind] += 1;
  console.log(`Result: ${counts.destructive} destructive, ${counts.changed} changed, ${counts.additive} additive.`);
  process.exit(exitCode(differences));
} else {
  console.error("Usage: baseline.ts capture | check");
  process.exit(2);
}
