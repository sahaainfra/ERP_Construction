// Reference module (Part 05 REQ-CORE-F17). Hidden behind ff.core.sample, which is off in every environment by default.
// It shows the shared kernel in use: a flag, an idempotent write, the unit of work, numbering, audit, the ledger, a protocol
// evaluation, an outbox event and a background job. It is not a business module and is never enabled in production.
import type { Pool } from "pg";
import { withTransaction } from "../db/transactions";
import { enqueueJob } from "./jobs";
import { AppError } from "./errors";
import { isEnabled, type FlagDefinition, type FlagEnvironment } from "./flags";
import { idempotent } from "./idempotency";
import { allocateNumber, createSeries } from "./numbering";
import { runUnitOfWork } from "./uow";
import type { RequestContext } from "./context";

export const SAMPLE_FLAG_KEY = "ff.core.sample";
export const SAMPLE_SERIES = "SMP";

export interface SampleInput {
  title: string;
  amountPaise: number;
  idempotencyKey: string;
}

export interface SampleResult {
  id: number;
  number: string;
  replayed: boolean;
}

function validate(input: SampleInput): void {
  const problems: { field: string; message: string }[] = [];
  if (input.title.trim().length < 2 || input.title.length > 200) problems.push({ field: "title", message: "2 to 200 characters" });
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 0) problems.push({ field: "amountPaise", message: "a whole number of paise, 0 or more" });
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the sample record is not valid", problems);
}

/**
 * Creates a sample record. When the flag is off, the module looks absent (NOT_FOUND), so it does not reveal itself.
 * A repeated call with the same key and body returns the first result and writes nothing new.
 */
export async function createSample(
  deps: { pool: Pool; flags: readonly FlagDefinition[]; env: FlagEnvironment },
  ctx: RequestContext,
  input: SampleInput,
): Promise<SampleResult> {
  const flag = deps.flags.find((f) => f.key === SAMPLE_FLAG_KEY);
  if (!isEnabled(flag, deps.env, ctx)) throw new AppError("NOT_FOUND", "the requested record does not exist");
  validate(input);
  await createSeries(deps.pool, ctx, { code: SAMPLE_SERIES, template: "SMP/{SEQ:5}" });

  const { replayed, response } = await idempotent(deps.pool, ctx, input.idempotencyKey, { title: input.title, amountPaise: input.amountPaise }, () =>
    runUnitOfWork(deps.pool, ctx, async (uow) => {
      const inserted = await uow.client.query<{ id: string }>(
        "INSERT INTO core_sample_records (tenant_id, title, amount_paise) VALUES ($1, $2, $3) RETURNING id",
        [ctx.tenantId, input.title, input.amountPaise],
      );
      const id = Number(inserted.rows[0].id);
      const allocation = await allocateNumber(uow.client, ctx, SAMPLE_SERIES, `sample:${id}`);
      await uow.client.query("UPDATE core_sample_records SET number = $2 WHERE id = $1", [id, allocation.formatted]);
      await uow.audit({ action: "sample.created", entityType: "sample", entityId: String(id), detail: { number: allocation.formatted } });
      await uow.ledger({ action: "CREATED", entityType: "sample", entityId: String(id) });
      await uow.evaluate({ cpCode: "CP-CORE-01", result: "PASS", detail: { method: "core.sample.create" } });
      await uow.emit({ eventType: "core.sample.created", payload: { id, number: allocation.formatted } });
      return { id, number: allocation.formatted };
    }),
  );

  if (!replayed) {
    // The job runs after the commit. Its own key makes a retry of this call enqueue nothing twice.
    await enqueueJob(deps.pool, ctx.tenantId, { type: "core.sample.index", payload: { id: response.id }, idempotencyKey: `sample-index-${response.id}` });
  }
  return { ...response, replayed };
}

/** Reads one sample record for the tenant. Row-level security applies. */
export async function getSample(pool: Pool, ctx: RequestContext, id: number): Promise<{ id: number; title: string; number: string | null } | null> {
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ id: string; title: string; number: string | null }>("SELECT id, title, number FROM core_sample_records WHERE id = $1", [id]);
      return rows.length === 0 ? null : { id: Number(rows[0].id), title: rows[0].title, number: rows[0].number };
    },
    { tenantId: ctx.tenantId },
  );
}
