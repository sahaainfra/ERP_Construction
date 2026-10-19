// Migration files, naming and lint rules (Part 03 REQ-DBF-F02). Pure functions; the runner in migrator.ts uses them.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import programModules from "../program/parts.generated.json";

export interface MigrationFile {
  version: string;
  moduleCode: string;
  name: string;
  upSql: string;
  downSql: string | null;
  checksum: string;
}

export interface LintViolation {
  rule: "name" | "module" | "down-script" | "destructive" | "float-money" | "not-null-without-default";
  message: string;
}

const NAME = /^(\d{12})_([a-z][a-z0-9]*)_([a-z0-9_]+)$/;

export const KNOWN_MODULE_CODES: ReadonlySet<string> = new Set(
  (programModules as { parts: { code: string }[] }).parts.map((p) => p.code),
);

export function sha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

/** Removes "--" line comments. Used before linting so that comments do not trigger rules. */
export function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const at = line.indexOf("--");
      return at >= 0 ? line.slice(0, at) : line;
    })
    .join("\n");
}

/** Loads <name>.up.sql and <name>.down.sql pairs from a directory, sorted by version. */
export function loadMigrations(dir: string): MigrationFile[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".up.sql") || f.endsWith(".down.sql"));
  const bases = [...new Set(files.map((f) => f.replace(/\.(up|down)\.sql$/, "")))];
  const out: MigrationFile[] = [];
  for (const base of bases) {
    const match = base.match(NAME);
    if (!match) throw new Error(`Migration file name "${base}" does not match <yyyymmddhhmm>_<code>_<description>`);
    const upSql = readFileSync(join(dir, `${base}.up.sql`), "utf8");
    const downPath = join(dir, `${base}.down.sql`);
    const downSql = files.includes(`${base}.down.sql`) ? readFileSync(downPath, "utf8") : null;
    out.push({ version: match[1], moduleCode: match[2], name: base, upSql, downSql, checksum: sha256(upSql) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const DESTRUCTIVE: readonly RegExp[] = [
  /\bDROP\s+(TABLE|SCHEMA|COLUMN|VIEW|MATERIALIZED\s+VIEW|FUNCTION|INDEX|TRIGGER|POLICY|TYPE)\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bRENAME\s+(TO|COLUMN|CONSTRAINT)\b/i,
  /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i,
  /\bALTER\s+TABLE\s+\S+\s+DROP\s+/i,
];

const MONEY_WORDS = /amount|total|price|rate|qty|quantity|balance|value|cost|wage|salary|tax|gst|debit|credit|amt|pct|percent/i;
const FLOAT_TYPE = /\b(REAL|DOUBLE\s+PRECISION|FLOAT4|FLOAT8|FLOAT)\b/i;

/**
 * Lints one migration. `acp` is the approved ACP reference from a header line such as "-- acp: ADR-004 step migrate".
 * Destructive statements are allowed only with that header (Part 03 REQ-DBF-F02, Part 00 §7.4).
 */
export function lintMigration(
  m: Pick<MigrationFile, "version" | "moduleCode" | "name" | "upSql" | "downSql">,
  knownModules: ReadonlySet<string> = KNOWN_MODULE_CODES,
): LintViolation[] {
  const violations: LintViolation[] = [];
  if (!NAME.test(m.name)) {
    violations.push({ rule: "name", message: `name "${m.name}" must be <yyyymmddhhmm>_<code>_<description>` });
  }
  if (!knownModules.has(m.moduleCode)) {
    violations.push({ rule: "module", message: `module code "${m.moduleCode}" is not in the Annex C index` });
  }
  if (m.downSql === null || stripSqlComments(m.downSql).trim() === "") {
    violations.push({ rule: "down-script", message: "a non-empty .down.sql is required (reversible migrations)" });
  }

  const sql = stripSqlComments(m.upSql);
  const acpApproved = /^\s*--\s*acp:\s*ADR-\d{3}\s+step\s+\w+/m.test(m.upSql);
  if (!acpApproved) {
    for (const pattern of DESTRUCTIVE) {
      const hit = sql.match(pattern);
      if (hit) {
        violations.push({
          rule: "destructive",
          message: `destructive statement "${hit[0].trim()}" needs an approved ACP step header (-- acp: ADR-nnn step <name>)`,
        });
      }
    }
  }

  // Float money and quantity: a column with a money or quantity name must use an exact type (AC-7).
  for (const line of sql.split("\n")) {
    const col = line.match(/^\s*"?(\w+)"?\s+(REAL|DOUBLE\s+PRECISION|FLOAT4|FLOAT8|FLOAT)\b/i);
    const alter = line.match(/ALTER\s+COLUMN\s+"?(\w+)"?\s+(SET\s+DATA\s+)?TYPE\s+(.+)/i);
    if (col && MONEY_WORDS.test(col[1]) && FLOAT_TYPE.test(col[2])) {
      violations.push({ rule: "float-money", message: `column "${col[1]}" holds money or quantity and uses floating point (AC-7)` });
    }
    if (alter && MONEY_WORDS.test(alter[1]) && FLOAT_TYPE.test(alter[3])) {
      violations.push({ rule: "float-money", message: `column "${alter[1]}" changes to floating point (AC-7)` });
    }
  }

  // NOT NULL without a default on an existing table fails on populated tables (Part 03 CI rules).
  for (const statement of sql.split(";")) {
    if (/ADD\s+COLUMN/i.test(statement) && /NOT\s+NULL/i.test(statement) && !/DEFAULT/i.test(statement) && !/GENERATED\s+ALWAYS/i.test(statement)) {
      violations.push({ rule: "not-null-without-default", message: `ADD COLUMN NOT NULL needs a DEFAULT: "${statement.trim().slice(0, 80)}"` });
    }
    if (/ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL/i.test(statement)) {
      violations.push({ rule: "not-null-without-default", message: `SET NOT NULL on an existing column needs a validated CHECK (NOT VALID) route: "${statement.trim().slice(0, 80)}"` });
    }
  }
  return violations;
}
