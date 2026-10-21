// Decision-table store (Part 16 REQ-WF-F03; CP-WF-04). Saving checks the table. Activation needs a recorded simulation and an activator who
// is not the author (maker-checker), and it retires the table it replaces.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { checkCoverage, validateTable, type Coverage, type Table } from "./decision";

export async function saveDecisionTable(pool: Pool, ctx: RequestContext, input: { code: string; table: Table }): Promise<{ version: number; coverage: Coverage }> {
  const problems = validateTable(input.table);
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", `the decision table is not valid: ${problems.join("; ")}`);
  const coverage = checkCoverage(input.table);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const { rows } = await uow.client.query<{ version: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM rul_decision_tables WHERE tenant_id = $1 AND code = $2",
      [ctx.tenantId, input.code],
    );
    const version = Number(rows[0].version);
    await uow.client.query(
      "INSERT INTO rul_decision_tables (tenant_id, code, version, status, table_json, created_by) VALUES ($1, $2, $3, 'draft', $4, $5)",
      [ctx.tenantId, input.code, version, JSON.stringify(input.table), ctx.userId],
    );
    await uow.audit({ action: "wf.decision_table.saved", entityType: "decision_table", entityId: `${input.code}@${version}`, detail: { gaps: coverage.gaps.length, overlaps: coverage.overlaps.length } });
    return { version, coverage };
  });
}

/** Records that a draft version was simulated. Activation refuses a version that was not. */
export async function recordSimulation(pool: Pool, ctx: RequestContext, input: { code: string; version: number }): Promise<void> {
  await runUnitOfWork(pool, ctx, async (uow) => {
    const updated = await uow.client.query("UPDATE rul_decision_tables SET simulated_at = now() WHERE tenant_id = $1 AND code = $2 AND version = $3 AND status = 'draft'", [ctx.tenantId, input.code, input.version]);
    if (updated.rowCount === 0) throw new AppError("NOT_FOUND", "no draft version was found to simulate");
    await uow.audit({ action: "wf.decision_table.simulated", entityType: "decision_table", entityId: `${input.code}@${input.version}` });
  });
}

export async function activateDecisionTable(pool: Pool, ctx: RequestContext, input: { code: string; version: number }): Promise<void> {
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ created_by: string; simulated_at: Date | null; status: string }>(
      "SELECT created_by, simulated_at, status FROM rul_decision_tables WHERE tenant_id = $1 AND code = $2 AND version = $3 FOR UPDATE",
      [ctx.tenantId, input.code, input.version],
    );
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the decision table version was not found");
    const row = found.rows[0];
    if (row.status !== "draft") throw new AppError("CONFLICT", "only a draft version can be activated");
    if (row.created_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the author cannot activate their own decision table");
    if (row.simulated_at === null) throw new AppError("VALIDATION_FAILED", "simulate the table before activating it (CP-WF-04)");
    await uow.client.query("UPDATE rul_decision_tables SET status = 'retired' WHERE tenant_id = $1 AND code = $2 AND status = 'active'", [ctx.tenantId, input.code]);
    await uow.client.query("UPDATE rul_decision_tables SET status = 'active', activated_by = $4, activated_at = now() WHERE tenant_id = $1 AND code = $2 AND version = $3", [ctx.tenantId, input.code, input.version, ctx.userId]);
    await uow.audit({ action: "wf.decision_table.activated", entityType: "decision_table", entityId: `${input.code}@${input.version}` });
    await uow.emit({ eventType: "wf.rule.activated", payload: { code: input.code, version: input.version }, aggregateKey: input.code });
  });
}

export async function activeTable(pool: Pool, ctx: RequestContext, code: string): Promise<Table | null> {
  const { rows } = await withTransaction(pool, (client) => client.query<{ table_json: Table }>("SELECT table_json FROM rul_decision_tables WHERE tenant_id = $1 AND code = $2 AND status = 'active'", [ctx.tenantId, code]), { tenantId: ctx.tenantId });
  return rows[0]?.table_json ?? null;
}
