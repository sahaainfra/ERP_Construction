// Correlation scope (Part 09 REQ-OBS-F01). The correlation id and trace id of the work in progress travel with the async call chain,
// so that every log line written beneath a request carries them without each caller passing them down.
import { AsyncLocalStorage } from "node:async_hooks";

export interface Correlation {
  correlationId: string;
  causationId: string | null;
  traceId: string | null;
  spanId: string | null;
}

const store = new AsyncLocalStorage<Correlation>();

/** Runs `work` with the given correlation. Nested scopes replace the outer one for their own duration only. */
export function withCorrelation<T>(correlation: Correlation, work: () => T): T {
  return store.run(correlation, work);
}

export function currentCorrelation(): Correlation | undefined {
  return store.getStore();
}
