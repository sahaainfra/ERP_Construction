// Transactional outbox (Part 03 REQ-DBF-F06; AC-5). The event row is written in the business transaction.
// The relay publishes unpublished rows in order; consumers must be idempotent (inbox), because a crash after publish and before commit repeats the batch.
import type { Pool, PoolClient } from "pg";

export const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*\.[a-z_]+$/;

export interface OutboxEvent {
  eventType: string;
  payload: Record<string, unknown>;
  tenantId?: string | null;
  schemaVersion?: number;
}

export interface OutboxRow {
  id: number;
  eventId: string;
  eventType: string;
  schemaVersion: number;
  tenantId: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

/** Writes an event inside the caller's transaction. Returns the event id. */
export async function enqueueEvent(client: PoolClient, event: OutboxEvent): Promise<string> {
  if (!EVENT_TYPE_PATTERN.test(event.eventType)) {
    throw new RangeError(`event type "${event.eventType}" must be <code>.<entity>.<past_tense_verb> (Part 00 AC-5)`);
  }
  const { rows } = await client.query<{ event_id: string }>(
    `INSERT INTO sys.outbox (event_type, schema_version, tenant_id, payload)
     VALUES ($1, $2, $3, $4) RETURNING event_id`,
    [event.eventType, event.schemaVersion ?? 1, event.tenantId ?? null, JSON.stringify(event.payload)],
  );
  return rows[0].event_id;
}

/**
 * Publishes one batch. Rows are locked with SKIP LOCKED so that two relays never publish the same row at once.
 * On publish failure the attempt is counted and the rows stay unpublished.
 */
export async function relayBatch(pool: Pool, publish: (rows: OutboxRow[]) => Promise<void>, limit = 100): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{
      id: number; event_id: string; event_type: string; schema_version: number; tenant_id: string | null; payload: Record<string, unknown>; attempts: number;
    }>(
      `SELECT id, event_id, event_type, schema_version, tenant_id, payload, attempts
         FROM sys.outbox WHERE published_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    if (rows.length === 0) {
      await client.query("COMMIT");
      return 0;
    }
    const batch: OutboxRow[] = rows.map((r) => ({
      id: r.id, eventId: r.event_id, eventType: r.event_type, schemaVersion: r.schema_version, tenantId: r.tenant_id, payload: r.payload, attempts: r.attempts,
    }));
    await publish(batch);
    await client.query("UPDATE sys.outbox SET published_at = now() WHERE id = ANY($1::bigint[])", [batch.map((b) => b.id)]);
    await client.query("COMMIT");
    return batch.length;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    // Count the failed attempt in its own statement so that the rollback above does not undo it.
    await pool.query(
      "UPDATE sys.outbox SET attempts = attempts + 1, last_error = $1 WHERE published_at IS NULL AND id IN (SELECT id FROM sys.outbox WHERE published_at IS NULL ORDER BY id LIMIT $2)",
      [(error as Error).message.slice(0, 500), limit],
    );
    throw error;
  } finally {
    client.release();
  }
}
