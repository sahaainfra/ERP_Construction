// Inbox (Part 10 REQ-EVBUS-F03; AC-5). A consumer records the event and applies its business effect in ONE transaction. A
// redelivered event finds its inbox row and does nothing, so a replay or a crash-and-retry never applies an effect twice.
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../db/transactions";
import { counter } from "../obs/metrics";
import type { Envelope } from "./envelope";

export type Handler = (client: PoolClient, envelope: Envelope) => Promise<void>;

export const DELIVERIES = counter("evbus_deliveries_total", "Event deliveries to consumers by outcome", ["consumer", "outcome"]);

/** Applies one event to one consumer. Returns "applied" the first time, "duplicate" afterwards. A failing handler rolls back the inbox row too. */
export async function inboxProcess(pool: Pool, consumer: string, envelope: Envelope, handler: Handler): Promise<"applied" | "duplicate"> {
  if (envelope.tenantId === null) throw new RangeError("only tenant events can be delivered to a consumer");
  try {
    const outcome = await withTransaction(
      pool,
      async (client) => {
        const inserted = await client.query(
          "INSERT INTO evt_inbox (tenant_id, consumer, event_id, event_type) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
          [envelope.tenantId, consumer, envelope.eventId, envelope.eventType],
        );
        if ((inserted.rowCount ?? 0) === 0) return "duplicate" as const;
        await handler(client, envelope);
        return "applied" as const;
      },
      { tenantId: envelope.tenantId },
    );
    DELIVERIES.inc({ consumer, outcome });
    return outcome;
  } catch (error) {
    DELIVERIES.inc({ consumer, outcome: "failed" });
    throw error;
  }
}
