// Secret scan over tracked files (Part 04 security slot). Reports file, line and kind; never the matched value.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
import { fileURLToPath } from "node:url";
import { secretFindings } from "../../src/program/secrets";

// Reviewed exceptions (docs/erp-program/secret-scan-allowlist.json). A hit is excused only when file and text both match.
const allowlist: { file: string; contains: string; reason: string }[] = JSON.parse(
  readFileSync(resolve(root, "docs/erp-program/secret-scan-allowlist.json"), "utf8"),
).entries;

const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !f.endsWith("package-lock.json") && !/\.(png|jpg|ico|svg|gif|woff2?|dump)$/i.test(f));

let total = 0;
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(resolve(root, file), "utf8");
  } catch {
    continue;
  }
  for (const hit of secretFindings(text)) {
    const line = text.split("\n")[hit.line - 1];
    if (allowlist.some((a) => a.file === file && line.includes(a.contains))) continue;
    total += 1;
    console.log(`SECRET ${hit.kind} ${file}:${hit.line}`);
  }
}
console.log(`Scanned ${files.length} tracked files: ${total} finding(s).`);
process.exitCode = total > 0 ? 1 : 0;
