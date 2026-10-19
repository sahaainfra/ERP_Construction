// Part 01 discovery: read-only inventory of the repository. Writes docs/erp-program/modules/disc/inventory.json.
// It records what exists and where, and records a search as empty when nothing matches. Deterministic: no timestamps.
// Run with: node scripts/erp-program/inventory.mjs
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, encoding: "utf8" }).trim();
const tracked = git("ls-files").split("\n").filter(Boolean);
const sourceFiles = tracked.filter((f) => /\.(tsx?|jsx?|mjs|cjs|css)$/.test(f) && !f.endsWith(".generated.json"));
const readText = (f) => readFileSync(join(root, f), "utf8");

// 1. Repository shape
const byExtension = {};
for (const f of tracked) {
  const ext = extname(f) || "(none)";
  byExtension[ext] = (byExtension[ext] ?? 0) + 1;
}

// 2. Routes and components
const appRoutes = tracked.filter((f) => /^src\/app\/.*\/(page|route)\.(tsx|ts)$/.test(f) || /^src\/app\/(page|route)\.(tsx|ts)$/.test(f)).sort();
const componentFiles = tracked.filter((f) => /^src\/(components|design)\/.*\.tsx$/.test(f)).sort();

// 3. Searches for systems that a live ERP would have. A zero count is recorded as an empty search, not omitted.
const SEARCHES = {
  database: /prisma|typeorm|sequelize|knex|\bpg\b|mysql|mongoose|sqlite|create table|information_schema/i,
  authentication: /next-auth|passport|jsonwebtoken|bcrypt|argon2|password|login/i,
  realtimeSockets: /socket\.io|websocket|eventsource|broadcastchannel/i,
  jobsAndSchedules: /\bcron\b|bullmq|agenda|node-schedule|setinterval/i,
  queuesAndBus: /kafka|rabbitmq|amqp|\bredis\b/i,
  httpIntegrations: /\bfetch\(|axios|https?:\/\/(?!localhost|127\.0\.0\.1)/i,
  documentsAndPdf: /pdfkit|puppeteer|jspdf|react-pdf|exceljs|\bxlsx\b/i,
  featureFlags: /\bff\.[a-z]/i,
  paymentsAndTax: /\bgstin\b|\birn\b|e-?way|\btds\b|razorpay|stripe/i,
};
const searchResults = {};
for (const [name, pattern] of Object.entries(SEARCHES)) {
  const hits = sourceFiles.filter((f) => pattern.test(readText(f)));
  searchResults[name] = { pattern: pattern.source, files: hits };
}
const ciFiles = [".github", ".gitlab-ci.yml", "Dockerfile", "docker-compose.yml", "Jenkinsfile", ".circleci"].filter((f) => existsSync(join(root, f)));

// 4. Arithmetic on money, quantity, rate or tax: candidates for the calculation registry (Part 22 input).
// Words that name a money or quantity value. "value" is left out: it is a JSX attribute almost everywhere.
const MONEY_WORDS = /\b(amount|total|rate|qty|quantity|tax|gst|price|cost|wage|salary|balance|retention|advance|variance|margin)\w*/i;
// Arithmetic needs spaces around the operator, so hyphenated names and class strings do not match.
const ARITH = /\s[+\-*/]\s|\)\s*\*\s|\w\*\w/;
const arithmetic = [];
for (const f of sourceFiles) {
  if (!/\.(tsx?|jsx?|mjs)$/.test(f) || f.startsWith("src/program/") && /\.test\.ts$/.test(f)) continue;
  readText(f).split("\n").forEach((line, i) => {
    if (MONEY_WORDS.test(line) && ARITH.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) {
      arithmetic.push({ file: f, line: i + 1 });
    }
  });
}

// 4b. Every exported symbol in the domain and program modules. This list is the authoritative input to the
// calculation registry; the keyword scan above is only a hint.
const exportedSymbols = [];
for (const f of tracked.filter((x) => /^src\/(domain|program)\/[^/]+\.ts$/.test(x) && !/\.test\.ts$/.test(x))) {
  readText(f).split("\n").forEach((line, i) => {
    const m = line.match(/^export (?:function|const) (\w+)/);
    if (m) exportedSymbols.push({ file: f, line: i + 1, name: m[1] });
  });
}

// 5. Secret patterns. Only file and line are recorded, never the matched text.
const SECRET_PATTERNS = {
  awsAccessKey: /AKIA[0-9A-Z]{16}/,
  privateKeyBlock: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  assignedSecret: /(api[_-]?key|secret|passwd|password|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
};
const secretFindings = [];
for (const f of tracked) {
  if (f.endsWith("package-lock.json") || !/\.(tsx?|jsx?|mjs|cjs|json|md|css|env|ya?ml|csv)$/.test(f) && !/\.env/.test(f)) continue;
  readText(f).split("\n").forEach((line, i) => {
    for (const [kind, pattern] of Object.entries(SECRET_PATTERNS)) {
      if (pattern.test(line)) secretFindings.push({ file: f, line: i + 1, kind });
    }
  });
}

// 6. Dependencies with licences, read from the installed packages.
const pkg = JSON.parse(readText("package.json"));
const dependencies = [];
for (const [scope, deps] of [["production", pkg.dependencies ?? {}], ["development", pkg.devDependencies ?? {}]]) {
  for (const name of Object.keys(deps).sort()) {
    const manifest = join(root, "node_modules", name, "package.json");
    const installed = existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")) : null;
    dependencies.push({
      name,
      scope,
      declared: deps[name],
      installed: installed?.version ?? null,
      license: installed?.license ?? null,
    });
  }
}

// 7. Local import graph and cycles (module coupling evidence for DEPENDENCY_MAP.md).
const modulePaths = sourceFiles.filter((f) => /\.(tsx?|jsx?)$/.test(f) && !/\.test\.tsx?$/.test(f));
const known = new Set(modulePaths);
const edges = new Map();
const IMPORT = /(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = relative(root, resolve(root, dirname(from), spec));
  else return null; // package import
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find((c) => known.has(c)) ?? null;
}
for (const f of modulePaths) {
  const targets = new Set();
  for (const m of readText(f).matchAll(IMPORT)) {
    const target = resolveImport(f, m[1] ?? m[2]);
    if (target && target !== f) targets.add(target);
  }
  edges.set(f, [...targets].sort());
}
// Cycle detection by depth-first search.
const cycles = [];
const state = new Map();
const stack = [];
function visit(node) {
  state.set(node, "open");
  stack.push(node);
  for (const next of edges.get(node) ?? []) {
    if (state.get(next) === "open") {
      cycles.push([...stack.slice(stack.indexOf(next)), next]);
    } else if (!state.has(next)) visit(next);
  }
  stack.pop();
  state.set(node, "done");
}
for (const f of [...edges.keys()].sort()) if (!state.has(f)) visit(f);

// 8. Dependency audit (read-only). npm audit exits non-zero when findings exist, so its output is read from the error.
function audit(scope) {
  const args = scope === "production" ? " --omit=dev" : "";
  let out;
  try {
    out = execSync(`npm audit --json${args}`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    out = e.stdout;
  }
  const data = JSON.parse(out);
  return {
    counts: data.metadata.vulnerabilities,
    findings: Object.values(data.vulnerabilities)
      .filter((v) => ["critical", "high", "moderate"].includes(v.severity))
      .map((v) => ({
        package: v.name,
        severity: v.severity,
        relation: v.isDirect ? "direct" : "transitive",
        range: v.range,
        fixAvailable: typeof v.fixAvailable === "object" ? `${v.fixAvailable.name}@${v.fixAvailable.version}` : Boolean(v.fixAvailable),
      }))
      .sort((a, b) => a.package.localeCompare(b.package)),
  };
}

const inventory = {
  head: git("rev-parse HEAD"),
  trackedFiles: tracked.length,
  filesByExtension: Object.fromEntries(Object.entries(byExtension).sort()),
  appRoutes,
  componentFiles,
  apiRouteHandlers: tracked.filter((f) => /\/route\.(ts|tsx|js)$/.test(f)),
  ciConfiguration: ciFiles,
  searches: searchResults,
  exportedSymbols,
  arithmeticOnMoneyOrQuantity: arithmetic,
  secretPatternMatches: secretFindings,
  dependencies,
  audit: { production: audit("production"), all: audit("all") },
  importGraph: { edges: Object.fromEntries([...edges].map(([k, v]) => [k, v])), cycles },
};

const out = join(root, "docs/erp-program/modules/disc/inventory.json");
writeFileSync(out, JSON.stringify(inventory, null, 2) + "\n");
const emptySearches = Object.entries(searchResults).filter(([, v]) => v.files.length === 0).map(([k]) => k);
console.log(`Inventory: ${tracked.length} tracked files, ${appRoutes.length} routes, ${componentFiles.length} component files.`);
console.log(`Empty searches: ${emptySearches.join(", ")}`);
console.log(`Exported domain/program symbols: ${exportedSymbols.length}. Arithmetic candidates: ${arithmetic.length}; secret-pattern matches: ${secretFindings.length}; import cycles: ${cycles.length}.`);
console.log(`Audit (all): ${JSON.stringify(inventory.audit.all.counts)}; (production): ${JSON.stringify(inventory.audit.production.counts)}.`);
