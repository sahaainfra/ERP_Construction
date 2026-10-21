// Build-time check for the route registry (Part 07 REQ-IAM-F22; CP-IAM-05). Lists every route file under src/app and compares it
// with src/iam/routes.ts. Exit 1 on any problem. Part of `npm run check:all`.
import { execFileSync } from "node:child_process";
import { registryProblems } from "../../src/iam/routes";

const files = execFileSync("git", ["ls-files", "src/app"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\/route\.(ts|tsx|js)$/.test(f));
const problems = registryProblems(files);
for (const p of problems) console.log(`ROUTE ${p}`);
console.log(`Checked ${files.length} route file(s) against the registry: ${problems.length} problem(s).`);
process.exitCode = problems.length > 0 ? 1 : 0;
