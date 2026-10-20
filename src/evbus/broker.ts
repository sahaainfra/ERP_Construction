// Broker abstraction (Part 10 REQ-EVBUS-F04; A-46). Modules see `Broker` and `Subscriptions` only. The PostgreSQL adapter delivers
// through the inbox; a Redis or BullMQ adapter can replace it behind the same interface once Redis is provisioned (CF-012).
import type { Pool } from "pg";
import type { Envelope } from "./envelope";
import { inboxProcess, type Handler } from "./inbox";
import { counter } from "../obs/metrics";

export interface Broker {
  readonly name: string;
  /** Delivers the envelopes, in order, to every subscribed consumer. Throws on the first failed delivery so that the batch is retried. */
  publish(envelopes: readonly Envelope[]): Promise<void>;
}

export interface Subscription {
  consumer: string;
  eventTypes: readonly string[];
  handler: Handler;
}

const CONSUMER = /^[a-z][a-z0-9_]*$/;

export class Subscriptions {
  private readonly subs = new Map<string, Subscription>();

  subscribe(sub: Subscription): void {
    if (!CONSUMER.test(sub.consumer)) throw new RangeError(`consumer name "${sub.consumer}" must be lower-case snake case`);
    if (sub.eventTypes.length === 0) throw new RangeError(`consumer ${sub.consumer} subscribes to no event type`);
    if (this.subs.has(sub.consumer)) throw new Error(`consumer ${sub.consumer} is already subscribed`);
    this.subs.set(sub.consumer, sub);
  }

  forEventType(eventType: string): Subscription[] {
    return [...this.subs.values()].filter((s) => s.eventTypes.includes(eventType));
  }

  get size(): number {
    return this.subs.size;
  }
}

export const NULL_TENANT_EVENTS = counter("evbus_null_tenant_events_total", "Events without a tenant, which no consumer can receive", ["event_type"]);

export function postgresBroker(pool: Pool, subscriptions: Subscriptions): Broker {
  return {
    name: "postgres",
    async publish(envelopes) {
      for (const envelope of envelopes) {
        if (envelope.tenantId === null) {
          NULL_TENANT_EVENTS.inc({ event_type: envelope.eventType });
          continue;
        }
        for (const sub of subscriptions.forEventType(envelope.eventType)) {
          await inboxProcess(pool, sub.consumer, envelope, sub.handler);
        }
      }
    },
  };
}
