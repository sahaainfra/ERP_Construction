// Event envelope (Part 10 REQ-EVBUS-F01; AC-5; A-48). Built from the outbox row, so the envelope a consumer sees is exactly the
// event that was committed with the business change. The idempotency key is the event id: one event, one business effect.
import type { OutboxRow } from "../db/outbox";

export interface Envelope {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  tenantId: string | null;
  occurredAt: string;
  aggregateKey: string;
  idempotencyKey: string;
  causationId: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
}

export function envelopeOf(row: OutboxRow): Envelope {
  return {
    eventId: row.eventId,
    eventType: row.eventType,
    schemaVersion: row.schemaVersion,
    tenantId: row.tenantId,
    occurredAt: row.createdAt.toISOString(),
    aggregateKey: row.aggregateKey ?? row.eventId,
    idempotencyKey: row.eventId,
    causationId: row.causationId,
    correlationId: row.correlationId,
    payload: row.payload,
  };
}
