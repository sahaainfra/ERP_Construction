// Idempotency middleware (Part 05 REQ-CORE-F04). Wraps the Part 03 key store and maps its errors to the envelope.
import type { Pool } from "pg";
import { executeIdempotent, IdempotencyConflict, IdempotencyInProgress } from "../db/idempotency";
import { AppError } from "./errors";
import type { RequestContext } from "./context";

export async function idempotent<T>(pool: Pool, ctx: RequestContext, key: string, body: unknown, handler: () => Promise<T>): Promise<{ replayed: boolean; response: T }> {
  try {
    return await executeIdempotent(pool, { scope: `${ctx.tenantId}:${ctx.userId}`, key, body }, handler);
  } catch (error) {
    if (error instanceof IdempotencyConflict) throw new AppError("IDEMPOTENCY_PAYLOAD_MISMATCH", "the key was used with a different body");
    if (error instanceof IdempotencyInProgress) throw new AppError("IDEMPOTENCY_IN_PROGRESS", "the request with this key is still running");
    throw error;
  }
}
