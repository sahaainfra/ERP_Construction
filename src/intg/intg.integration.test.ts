// Part 11 S1 database tests: registration, maker-checker on credentials, the guarded call (status, retries, breaker, refusals),
// versioned mappings and the monitor. No test calls a real host: the operation under test is a local function.
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerPermissions } from "../iam/roles";
import { INTG_PERMISSIONS, createConnector, callConnector, connectorStatus, resetBreakers, setUnavailable } from "./connectors";
import { proposeCredential, approveCredential, readActiveSecret, loadVaultKey } from "./vault";
import { addMapping } from "./mappings";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const REASON = "Bank connector for the payment file pilot";
const KEY = randomBytes(32);

function contextFor(tenantId: string, userId: string = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomBytes(4).toString("hex")}`,
  );
}

describe.skipIf(!TEST_URL || !APP_URL)("connector framework, vault, mappings and monitor (Part 11 S1)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-intgtest" });
    app = createPool(APP_URL!, { application_name: "erp-intgtest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
    await registerPermissions(app, [...INTG_PERMISSIONS]);
  });

  beforeEach(() => resetBreakers());

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** Grants the named permissions to a user through a role, bootstrapped the way the IAM tests do it. */
  async function grant(tenant: string, userId: string, keys: string[]): Promise<RequestContext> {
    await withTransaction(owner, async (c) => {
      const role = await c.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, 'Integration administrator', 'bootstrap') RETURNING id", [tenant, `intg_${randomUUID().slice(0, 8)}`]);
      for (const key of keys) {
        await c.query("INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, created_by, approved_by, approval_status, change_reason) VALUES ($1, $2, $3, 'allow', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap integration grant')", [tenant, role.rows[0].id, key]);
      }
      await c.query("INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, valid_from, created_by, approved_by, approval_status, reason) VALUES ($1, $2, $3, 'tenant', '2026-01-01', 'bootstrap', 'bootstrap-owner', 'approved', 'Bootstrap integration assignment')", [tenant, userId, role.rows[0].id]);
    }, { tenantId: tenant });
    return contextFor(tenant, userId);
  }

  async function setup() {
    const tenant = randomUUID();
    const manager = randomUUID();
    const proposer = await grant(tenant, manager, ["intg.connector.manage", "intg.credential.manage"]);
    const approver = await grant(tenant, randomUUID(), ["intg.credential.approve"]);
    await createConnector(app, proposer, { code: "bank_sftp", connectorType: "bank_file", allowedHosts: ["sftp-pilot.example.in"], reason: REASON });
    return { tenant, proposer, approver };
  }

  /** Reads through the tenant's own transaction: row-level security applies to the owner role as well. */
  function inTenant<T>(tenant: string, query: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
    return withTransaction(owner, query, { tenantId: tenant });
  }

  async function messages(tenant: string, code: string): Promise<{ status: string; attempts: number; error_code: string | null }[]> {
    const { rows } = await inTenant(tenant, (c) => c.query("SELECT status, attempts, error_code FROM intg_messages WHERE connector_code = $1 ORDER BY id", [code]));
    return rows;
  }

  it("registers a connector as configured_untested, and refuses secrets in config, duplicates and missing permission", async () => {
    const { tenant, proposer } = await setup();
    const status = await connectorStatus(app, proposer);
    expect(status).toEqual([expect.objectContaining({ code: "bank_sftp", status: "configured_untested", breaker: "closed", stale: false })]);
    await expect(createConnector(app, proposer, { code: "bank_two", connectorType: "bank_file", allowedHosts: ["b.example.in"], config: { password: "x" }, reason: REASON })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(createConnector(app, proposer, { code: "bank_sftp", connectorType: "bank_file", allowedHosts: ["sftp-pilot.example.in"], reason: REASON })).rejects.toMatchObject({ code: "CONFLICT" });
    const nobody = contextFor(tenant);
    await expect(createConnector(app, nobody, { code: "bank_three", connectorType: "bank_file", allowedHosts: ["c.example.in"], reason: REASON })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stores a secret only encrypted, lets someone other than the proposer approve it, and supersedes the old version", async () => {
    const { tenant, proposer, approver } = await setup();
    const secret = "sftp-key-material-0001";
    const v1 = await proposeCredential(app, proposer, KEY, { connectorCode: "bank_sftp", secret, reason: "Initial bank key for the pilot" });
    expect(v1).toEqual({ version: 1 });
    expect(await readActiveSecret(app, tenant, "bank_sftp", KEY)).toBeNull();
    const raw = await inTenant(tenant, (c) => c.query("SELECT ciphertext FROM intg_credentials_ref WHERE version = 1"));
    expect(raw.rows[0].ciphertext).not.toContain(secret);
    await expect(approveCredential(app, proposer, { connectorCode: "bank_sftp", version: 1, reason: "Approving my own proposal" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await approveCredential(app, approver, { connectorCode: "bank_sftp", version: 1, reason: "Checked against the bank letter" });
    expect((await readActiveSecret(app, tenant, "bank_sftp", KEY))?.toString("utf8")).toBe(secret);

    await proposeCredential(app, proposer, KEY, { connectorCode: "bank_sftp", secret: "sftp-key-material-0002", reason: "Rotation after the pilot review" });
    await approveCredential(app, approver, { connectorCode: "bank_sftp", version: 2, reason: "Rotation checked with the bank" });
    expect((await readActiveSecret(app, tenant, "bank_sftp", KEY))?.toString("utf8")).toBe("sftp-key-material-0002");
    const active = await inTenant(tenant, (c) => c.query("SELECT count(*)::int AS n FROM intg_credentials_ref WHERE status = 'active'"));
    expect(active.rows[0].n).toBe(1);
    expect(() => loadVaultKey({ ...process.env, INTG_VAULT_KEY: "" })).toThrow("INTG_VAULT_KEY");
  });

  it("makes a connector active only after a real successful call, and records the attempt", async () => {
    const { tenant, proposer } = await setup();
    const result = await callConnector(app, { tenantId: tenant, connectorCode: "bank_sftp", operation: "file.check", correlationId: "c-1", idempotent: true, retryDelayMs: 0 }, async () => "ok");
    expect(result).toBe("ok");
    expect((await connectorStatus(app, proposer))[0]).toMatchObject({ status: "active", consecutiveFailures: 0, stale: false });
    expect(await messages(tenant, "bank_sftp")).toEqual([{ status: "succeeded", attempts: 1, error_code: null }]);
  });

  it("retries an idempotent operation, but attempts a non-idempotent one once", async () => {
    const { tenant } = await setup();
    let tries = 0;
    const flaky = async () => { tries++; if (tries < 3) throw new Error("connection reset"); return "done"; };
    await expect(callConnector(app, { tenantId: tenant, connectorCode: "bank_sftp", operation: "statement.fetch", correlationId: "c-2", idempotent: true, retryDelayMs: 0 }, flaky)).resolves.toBe("done");
    expect(tries).toBe(3);
    let once = 0;
    await expect(callConnector(app, { tenantId: tenant, connectorCode: "bank_sftp", operation: "payment.submit", correlationId: "c-3", idempotent: false, retryDelayMs: 0 }, async () => { once++; throw new Error("timeout"); })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(once).toBe(1);
    const rows = await messages(tenant, "bank_sftp");
    expect(rows.at(-1)).toEqual({ status: "failed", attempts: 1, error_code: "SERVICE_UNAVAILABLE" });
  });

  it("opens the breaker after repeated failures, marks the connector failed, refuses while open, and does not count a refused destination", async () => {
    const { tenant, proposer } = await setup();
    const breaker = { threshold: 2, windowMs: 60_000, cooldownMs: 60_000 };
    const down = async () => { throw new Error("ECONNREFUSED"); };
    await expect(callConnector(app, { tenantId: tenant, connectorCode: "bank_sftp", operation: "file.check", correlationId: "c-4", idempotent: false, breaker }, down)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(callConnector(app, { tenantId: tenant, connectorCode: "bank_sftp", operation: "file.check", correlationId: "c-5", idempotent: false, breaker }, down)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect((await connectorStatus(app, proposer))[0]).toMatchObject({ status: "failed", breaker: "open", consecutiveFailures: 2 });
    await expect(callConnector(app, { tenantId: tenant, connectorCode: "bank_sftp", operation: "file.check", correlationId: "c-6", idempotent: false, breaker }, async () => "never")).rejects.toThrow(/paused after repeated failures/);
    expect((await messages(tenant, "bank_sftp")).at(-1)).toEqual({ status: "refused", attempts: 1, error_code: "SERVICE_UNAVAILABLE" });

    await createConnector(app, proposer, { code: "bank_ftp", connectorType: "bank_file", allowedHosts: ["f.example.in"], reason: REASON });
    await expect(callConnector(app, { tenantId: tenant, connectorCode: "bank_ftp", operation: "file.check", correlationId: "c-7", idempotent: false, breaker }, async () => { throw new AppError("FORBIDDEN", "the destination is not allowed: the host is not on the connector's allow-list"); })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await connectorStatus(app, proposer)).find((c) => c.code === "bank_ftp")).toMatchObject({ breaker: "closed", consecutiveFailures: 0 });
  });

  it("refuses a call to a connector marked unavailable in this environment, with a reason", async () => {
    const { tenant, proposer } = await setup();
    await createConnector(app, proposer, { code: "weighbridge_gate", connectorType: "device", allowedHosts: ["wb.example.in"], reason: REASON });
    await setUnavailable(app, proposer, "weighbridge_gate", "No weighbridge unit exists in this environment");
    await expect(callConnector(app, { tenantId: tenant, connectorCode: "weighbridge_gate", operation: "ticket.pull", correlationId: "c-8", idempotent: true }, async () => "never")).rejects.toThrow("not available in this environment");
    expect(await messages(tenant, "weighbridge_gate")).toEqual([{ status: "refused", attempts: 1, error_code: "SERVICE_UNAVAILABLE" }]);
  });

  it("versions a mapping: a change adds a version and supersedes the active one; nothing is overwritten", async () => {
    const { tenant, proposer } = await setup();
    const base = { connectorCode: "bank_sftp", entity: "bank_code" as const, erpCode: "HDFC", reason: "Bank code for the payment file" };
    expect(await addMapping(app, proposer, { ...base, extCode: "HDFC0000001" })).toEqual({ version: 1 });
    expect(await addMapping(app, proposer, { ...base, extCode: "HDFC0000002" })).toEqual({ version: 2 });
    const rows = await inTenant(tenant, (c) => c.query("SELECT version, ext_code, status FROM intg_mappings ORDER BY version"));
    expect(rows.rows).toEqual([{ version: 1, ext_code: "HDFC0000001", status: "superseded" }, { version: 2, ext_code: "HDFC0000002", status: "active" }]);
    await expect(addMapping(app, contextFor(tenant), { ...base, extCode: "HDFC0000003" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addMapping(app, proposer, { ...base, erpCode: "x", extCode: "y", reason: "short" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("flags an active connector whose last success is over an hour old as stale", async () => {
    const { tenant, proposer } = await setup();
    await callConnector(app, { tenantId: tenant, connectorCode: "bank_sftp", operation: "file.check", correlationId: "c-9", idempotent: true }, async () => "ok");
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
    expect((await connectorStatus(app, proposer, later))[0].stale).toBe(true);
  });
});
