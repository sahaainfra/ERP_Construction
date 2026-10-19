// Integrity service (Part 03 REQ-DBF-F05). Snapshots count and checksum a table; registered invariants return violations.
// Findings are recorded for the owning module and are never corrected automatically.
import type { Pool, PoolClient } from "pg";

const IDENT = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

/** Quotes a possibly schema-qualified identifier. Only lower-case names are accepted, so user input cannot inject SQL. */
export function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new RangeError(`"${name}" is not an allowed identifier`);
  return name.split(".").map((part) => `"${part}"`).join(".");
}

export interface TableSnapshot {
  rowCount: number;
  checksum: string;
}

/** Row count and a checksum over every row in primary-key order. Full scan; sampling for very large tables is a Part 84 job. */
export async function snapshotTable(client: PoolClient | Pool, table: string, primaryKey: string): Promise<TableSnapshot> {
  const t = quoteIdent(table);
  const pk = quoteIdent(primaryKey);
  const { rows } = await client.query<{ n: string; checksum: string }>(
    `SELECT count(*)::text AS n,
            encode(sha256(convert_to(COALESCE(string_agg(x::text, E'\\n' ORDER BY x.${pk}), ''), 'UTF8')), 'hex') AS checksum
       FROM ${t} AS x`,
  );
  return { rowCount: Number(rows[0].n), checksum: rows[0].checksum };
}

export interface InvariantRegistration {
  code: string;
  moduleCode: string;
  description: string;
  /** SELECT returning columns key_ref and detail, one row per violation. */
  sql: string;
  severity: "critical" | "high" | "medium" | "low";
}

export async function registerInvariant(pool: Pool, inv: InvariantRegistration): Promise<void> {
  await pool.query(
    `INSERT INTO sys.integrity_invariants (code, module_code, description, sql_text, severity)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, sql_text = EXCLUDED.sql_text, severity = EXCLUDED.severity, active = true`,
    [inv.code, inv.moduleCode, inv.description, inv.sql, inv.severity],
  );
}

export interface InvariantRunSummary {
  invariantsChecked: number;
  violationsFound: number;
  newFindings: number;
}

/** Runs every active invariant. A violation already open for the same invariant and key is not recorded twice. */
export async function runInvariants(pool: Pool, ownerModuleFor: (code: string) => string = () => "dbf"): Promise<InvariantRunSummary> {
  const { rows: invariants } = await pool.query<{ code: string; sql_text: string; severity: InvariantRegistration["severity"] }>(
    "SELECT code, sql_text, severity FROM sys.integrity_invariants WHERE active ORDER BY code",
  );
  let violations = 0;
  let created = 0;
  for (const inv of invariants) {
    const { rows } = await pool.query<{ key_ref: string; detail: string | null }>(inv.sql_text);
    for (const row of rows) {
      violations += 1;
      const inserted = await pool.query(
        `INSERT INTO sys.integrity_findings (invariant_code, severity, key_ref, detail, owner_module)
         SELECT $1, $2, $3, $4, $5
          WHERE NOT EXISTS (SELECT 1 FROM sys.integrity_findings WHERE invariant_code = $1 AND key_ref = $3 AND status IN ('open', 'acknowledged'))`,
        [inv.code, inv.severity, row.key_ref, row.detail, ownerModuleFor(inv.code)],
      );
      created += inserted.rowCount ?? 0;
    }
  }
  return { invariantsChecked: invariants.length, violationsFound: violations, newFindings: created };
}
