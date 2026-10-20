// Relay (Part 10 REQ-EVBUS-F02). Publishes the committed outbox rows in order through a broker, and measures the lag from commit
// to publish. A failed batch stays unpublished and is retried; the inbox makes the retry safe.
import type { Pool } from "pg";
import { relayBatch } from "../db/outbox";
import { histogram } from "../obs/metrics";
import { envelopeOf } from "./envelope";
import type { Broker } from "./broker";

export const RELAY_LAG = histogram("evbus_relay_lag_seconds", "Seconds from commit of an event to its publish", ["broker"], [0.1, 0.5, 1, 2, 5, 10, 30, 60]);

/** Publishes up to `limit` unpublished events. Returns how many were published. */
export async function relayOnce(pool: Pool, broker: Broker, limit = 100): Promise<number> {
  return relayBatch(
    pool,
    async (rows) => {
      await broker.publish(rows.map(envelopeOf));
      const now = Date.now();
      // Measured after a successful publish, so a retried batch is not counted twice.
      for (const row of rows) RELAY_LAG.observe({ broker: broker.name }, (now - row.createdAt.getTime()) / 1000);
    },
    limit,
  );
}
