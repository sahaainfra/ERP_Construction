// Audit chain acceptance tests (Part 08 S1). Run against the test database; skipped without it.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { recordSensitiveRead, recordTimeline, verifyChain, writeAudit } from "./audit";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");

function contextFor(tenantId: string, userId = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

describe.skipIf(!TEST_URL || !APP_URL)("audit chain (Part 08 S1)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-audittest" });
    app = createPool(APP_URL!, { application_name: "erp-audittest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  it("keeps the chain contiguous and valid under 20 parallel writes for one tenant", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      withTransaction(app, (c) => writeAudit(c, ctx, { action: "procurement.po.created", entityType: "po", entityId: `PO-${i}`, after: { i } }), { tenantId: tenant })));
    const result = await verifyChain(app, ctx);
    expect(result).toMatchObject({ ok: true, checked: 20 });
    const seqs = await withTransaction(app, (c) => c.query<{ seq: string }>("SELECT seq FROM sec_audit_log ORDER BY seq"), { tenantId: tenant });
    expect(seqs.rows.map((r) => Number(r.seq))).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("writes the change and its audit row together, and writes neither when the change fails", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    await expect(runUnitOfWork(app, ctx, async (uow) => {
      await uow.client.query("INSERT INTO core_settings (tenant_id, scope_type, scope_id, setting_key, value_json, changed_by, change_reason) VALUES ($1, 'tenant', $2, 'core.locale.default', '\"en-IN\"', $3, 'Rollback check for the audit chain')", [tenant, tenant, ctx.userId]);
      await uow.audit({ action: "setting.changed", entityType: "setting", entityId: "x" });
      throw new Error("forced failure after the change and the audit row");
    })).rejects.toThrow("forced");
    const rows = await withTransaction(app, (c) => c.query("SELECT 1 FROM sec_audit_log"), { tenantId: tenant });
    expect(rows.rowCount).toBe(0);
    const settings = await withTransaction(app, (c) => c.query("SELECT 1 FROM core_settings"), { tenantId: tenant });
    expect(settings.rowCount).toBe(0);
  });

  it("refuses a reason-required action without a reason, and records one with a reason", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    await expect(withTransaction(app, (c) => writeAudit(c, ctx, { action: "document.rejected", entityType: "po", entityId: "PO-9" }), { tenantId: tenant })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await withTransaction(app, (c) => writeAudit(c, ctx, { action: "document.rejected", entityType: "po", entityId: "PO-9", reasonCode: "RATE_MISMATCH", reason: "Quoted rate is above the approved SOR" }), { tenantId: tenant });
    const timeline = await recordTimeline(app, ctx, "po", "PO-9");
    expect(timeline[0]).toMatchObject({ action: "document.rejected", reasonCode: "RATE_MISMATCH" });
  });

  it("detects a changed row and a removed row, and reports where the chain breaks", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    for (let i = 1; i <= 4; i++) await withTransaction(app, (c) => writeAudit(c, ctx, { action: "bank.detail.viewed", entityType: "vendor", entityId: `V-${i}`, after: { amount: i * 100 } }), { tenantId: tenant });
    expect(await verifyChain(app, ctx)).toMatchObject({ ok: true, checked: 4 });
    // Tamper as the owner, bypassing the append-only trigger, the way an attacker with database rights would.
    await withTransaction(owner, async (c) => {
      await c.query("ALTER TABLE sec_audit_log DISABLE TRIGGER ALL");
      await c.query("UPDATE sec_audit_log SET after_json = '{\"amount\": 999999}' WHERE tenant_id = $1 AND seq = 2", [tenant]);
      await c.query("ALTER TABLE sec_audit_log ENABLE TRIGGER ALL");
    }, { tenantId: tenant });
    expect(await verifyChain(app, ctx)).toMatchObject({ ok: false, brokenAtSeq: 2, reason: "the row content does not match its hash" });

    const other = randomUUID();
    const otherCtx = contextFor(other);
    for (let i = 1; i <= 3; i++) await withTransaction(app, (c) => writeAudit(c, otherCtx, { action: "bank.detail.viewed", entityType: "vendor", entityId: `W-${i}` }), { tenantId: other });
    await withTransaction(owner, async (c) => {
      await c.query("ALTER TABLE sec_audit_log DISABLE TRIGGER ALL");
      await c.query("DELETE FROM sec_audit_log WHERE tenant_id = $1 AND seq = 2", [other]);
      await c.query("ALTER TABLE sec_audit_log ENABLE TRIGGER ALL");
    }, { tenantId: other });
    expect(await verifyChain(app, otherCtx)).toMatchObject({ ok: false, brokenAtSeq: 3, reason: "the link to the previous row is broken" });
  });

  it("is append-only for the application role", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    await withTransaction(app, (c) => writeAudit(c, ctx, { action: "bank.detail.viewed", entityType: "vendor", entityId: "V-1" }), { tenantId: tenant });
    await expect(withTransaction(app, (c) => c.query("UPDATE sec_audit_log SET reason = 'edited'"), { tenantId: tenant })).rejects.toThrow();
  });

  it("logs a sensitive read, and the read itself enters the chain", async () => {
    const tenant = randomUUID();
    const ctx = contextFor(tenant);
    await recordSensitiveRead(app, ctx, { entityType: "employee", entityId: "EMP-7", fields: ["salary", "bank_account"], reason: "Payroll review" });
    const reads = await withTransaction(app, (c) => c.query("SELECT fields FROM sec_sensitive_reads WHERE entity_id = 'EMP-7'"), { tenantId: tenant });
    expect(reads.rows[0].fields).toEqual(["salary", "bank_account"]);
    const timeline = await recordTimeline(app, ctx, "employee", "EMP-7");
    expect(timeline[0]).toMatchObject({ action: "secgov.sensitive_read" });
  });

  it("keeps one tenant's chain invisible to another", async () => {
    const a = randomUUID();
    const ctxA = contextFor(a);
    await withTransaction(app, (c) => writeAudit(c, ctxA, { action: "bank.detail.viewed", entityType: "vendor", entityId: "V-A" }), { tenantId: a });
    expect(await verifyChain(app, contextFor(randomUUID()))).toEqual({ ok: true, checked: 0, brokenAtSeq: null, reason: null });
  });
});
