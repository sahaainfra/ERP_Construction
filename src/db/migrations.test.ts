import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintMigration, loadMigrations, stripSqlComments } from "./migrations";

const dir = join(__dirname, "../../db/migrations");
const base: { version: string; moduleCode: string; name: string; upSql: string; downSql: string | null } = {
  version: "202610191200", moduleCode: "dbf", name: "202610191200_dbf_sys_test", upSql: "", downSql: "DROP TABLE IF EXISTS t;",
};
const lint = (upSql: string, overrides: Partial<typeof base> = {}) => lintMigration({ ...base, upSql, ...overrides });

describe("migration files", () => {
  it("loads the committed migrations in order with checksums", () => {
    const migrations = loadMigrations(dir);
    expect(migrations.map((m) => m.name)).toEqual(["202610191200_dbf_sys_foundation", "202610191230_dbf_sys_operations", "202610191300_core_shared_kernel", "202610191400_org_structure", "202610191500_org_projects_sites", "202610191600_org_lbs_geofence_allocation"]);
    expect(migrations.every((m) => m.downSql !== null && /^[0-9a-f]{64}$/.test(m.checksum))).toBe(true);
  });

  it("passes the lint on every committed migration", () => {
    for (const m of loadMigrations(dir)) expect(lintMigration(m), m.name).toEqual([]);
  });

  it("strips line comments before linting", () => {
    expect(stripSqlComments("CREATE TABLE a (x int); -- DROP TABLE b;\nSELECT 1;")).not.toContain("DROP");
  });
});

describe("migration lint (REQ-DBF-F02)", () => {
  it("rejects a file name that does not match the convention", () => {
    expect(lint("SELECT 1;", { name: "add_things" }).map((v) => v.rule)).toContain("name");
  });

  it("rejects an unknown module code", () => {
    expect(lint("SELECT 1;", { moduleCode: "nosuch" }).map((v) => v.rule)).toContain("module");
  });

  it("requires a down script", () => {
    expect(lint("SELECT 1;", { downSql: null }).map((v) => v.rule)).toContain("down-script");
  });

  it.each([
    "DROP TABLE orders;",
    "ALTER TABLE orders DROP COLUMN notes;",
    "TRUNCATE orders;",
    "DELETE FROM orders WHERE id = 1;",
    "ALTER TABLE orders RENAME COLUMN a TO b;",
    "ALTER TABLE orders ALTER COLUMN code TYPE text;",
  ])("rejects %s without an approved ACP step", (sql) => {
    expect(lint(sql).map((v) => v.rule)).toContain("destructive");
  });

  it("allows a destructive statement only with an approved ACP header", () => {
    const sql = "-- acp: ADR-004 step contract\nDROP TABLE old_orders;";
    expect(lint(sql).map((v) => v.rule)).not.toContain("destructive");
  });

  it("rejects a floating-point money or quantity column", () => {
    expect(lint("CREATE TABLE t (\n  invoice_amount double precision NOT NULL\n);").map((v) => v.rule)).toContain("float-money");
    expect(lint("CREATE TABLE t (\n  qty real\n);").map((v) => v.rule)).toContain("float-money");
  });

  it("allows floating point on a non-money column", () => {
    expect(lint("CREATE TABLE t (\n  sensor_score double precision\n);").map((v) => v.rule)).not.toContain("float-money");
  });

  it("rejects a money column changed to floating point", () => {
    expect(lint("ALTER TABLE t ALTER COLUMN unit_rate TYPE double precision;").map((v) => v.rule)).toContain("float-money");
  });

  it("rejects ADD COLUMN NOT NULL without a default", () => {
    expect(lint("ALTER TABLE t ADD COLUMN region text NOT NULL;").map((v) => v.rule)).toContain("not-null-without-default");
    expect(lint("ALTER TABLE t ADD COLUMN region text NOT NULL DEFAULT 'IN';").map((v) => v.rule)).not.toContain("not-null-without-default");
  });

  it("rejects SET NOT NULL on an existing column", () => {
    expect(lint("ALTER TABLE t ALTER COLUMN region SET NOT NULL;").map((v) => v.rule)).toContain("not-null-without-default");
  });
});
