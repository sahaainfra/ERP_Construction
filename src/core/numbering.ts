// Numbering service (Part 05 REQ-CORE-F09; AC-6). One locked counter row per series; allocation is inside the caller's transaction.
// Gap-free: a number allocated in a transaction that rolls back returns to the counter, so no number is skipped. No issued number
// is reused. Voids keep the number and record a reason.
import type { Pool, PoolClient } from "pg";
import { formatDocumentNumber } from "../domain/numbering";
import { withTransaction } from "../db/transactions";
import { AppError } from "./errors";
import { runUnitOfWork } from "./uow";
import type { RequestContext } from "./context";

export interface Allocation {
  seriesCode: string;
  seq: number;
  formatted: string;
}

export async function createSeries(pool: Pool, ctx: RequestContext, series: { code: string; template: string; gapless?: boolean }): Promise<void> {
  if (!/^[A-Z][A-Z0-9_-]{1,39}$/.test(series.code)) throw new AppError("VALIDATION_FAILED", "series code format", [{ field: "code", message: "uppercase letters, digits, - and _" }]);
  await withTransaction(
    pool,
    (client) =>
      client.query(
        "INSERT INTO core_number_series (tenant_id, series_code, template, is_gapless) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [ctx.tenantId, series.code, series.template, series.gapless ?? true],
      ),
    { tenantId: ctx.tenantId },
  );
}

/** Allocates the next number. Call inside a unit of work so that the counter and the document commit together. */
export async function allocateNumber(client: PoolClient, ctx: RequestContext, seriesCode: string, docRef: string): Promise<Allocation> {
  const locked = await client.query<{ template: string; next_value: string }>(
    "SELECT template, next_value::text FROM core_number_series WHERE tenant_id = $1 AND series_code = $2 FOR UPDATE",
    [ctx.tenantId, seriesCode],
  );
  if (locked.rowCount === 0) throw new AppError("NUMBER_SERIES_UNKNOWN", `series ${seriesCode} is not defined`);
  const seq = Number(locked.rows[0].next_value);
  const formatted = formatDocumentNumber(locked.rows[0].template, { SEQ: seq });
  await client.query("UPDATE core_number_series SET next_value = next_value + 1 WHERE tenant_id = $1 AND series_code = $2", [ctx.tenantId, seriesCode]);
  await client.query(
    "INSERT INTO core_number_allocations (tenant_id, series_code, seq, formatted, doc_ref) VALUES ($1, $2, $3, $4, $5)",
    [ctx.tenantId, seriesCode, seq, formatted, docRef],
  );
  return { seriesCode, seq, formatted };
}

/** Voids an allocated number and keeps it on record with the reason. */
export async function voidNumber(pool: Pool, ctx: RequestContext, seriesCode: string, seq: number, reason: string): Promise<void> {
  if (reason.trim().length < 10) throw new AppError("NUMBER_VOID_REASON_REQUIRED", "reason too short");
  await runUnitOfWork(pool, ctx, async (uow) => {
    const updated = await uow.client.query(
      "UPDATE core_number_allocations SET status = 'voided', void_reason = $4 WHERE tenant_id = $1 AND series_code = $2 AND seq = $3 AND status = 'allocated'",
      [ctx.tenantId, seriesCode, seq, reason],
    );
    if (updated.rowCount !== 1) throw new AppError("VALIDATION_FAILED", "only an allocated, unused number can be voided");
    await uow.audit({ action: "number.voided", entityType: "number_series", entityId: `${seriesCode}:${seq}`, detail: { reason } });
    await uow.ledger({ action: "CANCELLED", entityType: "number_series", entityId: `${seriesCode}:${seq}`, reason });
  });
}

/** Preview of the next number without allocating it. */
export async function previewNext(pool: Pool, ctx: RequestContext, seriesCode: string): Promise<string> {
  const { rows } = await withTransaction(
    pool,
    (client) =>
      client.query<{ template: string; next_value: string }>(
        "SELECT template, next_value::text FROM core_number_series WHERE tenant_id = $1 AND series_code = $2",
        [ctx.tenantId, seriesCode],
      ),
    { tenantId: ctx.tenantId },
  );
  if (rows.length === 0) throw new AppError("NUMBER_SERIES_UNKNOWN", `series ${seriesCode} is not defined`);
  return formatDocumentNumber(rows[0].template, { SEQ: Number(rows[0].next_value) });
}
