// Architecture conformance gate (Part 02 REQ-ARCH-F17; CP-ARCH-01 and CP-ARCH-02).
// Exits 1 on any boundary violation or any dependency not on the allow-list.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boundaryViolations, localImports, unlistedDependencies } from "../../src/program/architecture";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(relative(root, full).split("\\").join("/"));
  }
  return out;
}

const files = walk(join(root, "src"));
const known = new Set(files);
const edges: Record<string, string[]> = {};
for (const f of files) edges[f] = localImports(f, readFileSync(join(root, f), "utf8"), known);

const violations = boundaryViolations(edges);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const allowlistPath = join(root, "docs/erp-program/DEPENDENCY_ALLOWLIST.json");
const allowlist: string[] = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, "utf8")).packages : [];
const unlisted = unlistedDependencies(pkg, allowlist);

for (const v of violations) console.log(`BOUNDARY  ${v.rule}: ${v.from} → ${v.to}  (${v.reason})`);
for (const name of unlisted) console.log(`DEPENDENCY ${name} is not on docs/erp-program/DEPENDENCY_ALLOWLIST.json (CP-ARCH-01)`);
const edgeCount = Object.values(edges).reduce((n, t) => n + t.length, 0);
console.log(`Checked ${files.length} files and ${edgeCount} local imports; ${violations.length} boundary violation(s); ${unlisted.length} unlisted dependency(ies).`);
process.exit(violations.length + unlisted.length > 0 ? 1 : 0);
