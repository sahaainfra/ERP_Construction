// Shared frontend services (Part 05 REQ-CORE-F18). Pure functions only: no server modules are imported, so the browser bundle
// stays small. Offline detection is an interface here; Part 14 implements it.
import { ERROR_CATALOGUE, type ErrorEnvelope } from "./errors";
import { translate } from "./i18n";

export const CORRELATION_HEADER = "X-Correlation-Id";
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/** Headers for every API call. Writes must also carry an idempotency key (Part 05 REQ-CORE-F04). */
export function requestHeaders(options: { correlationId: string; idempotencyKey?: string }): Record<string, string> {
  const headers: Record<string, string> = { [CORRELATION_HEADER]: options.correlationId };
  if (options.idempotencyKey) headers[IDEMPOTENCY_HEADER] = options.idempotencyKey;
  return headers;
}

/** A new idempotency key for one user action. Retries of the same action reuse the key. */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

/** Permission check for a screen or control: `can(granted, "po.approve")`. The server still authorises every request. */
export function can(granted: ReadonlySet<string> | readonly string[], key: string): boolean {
  return (granted instanceof Set ? granted : new Set(granted)).has(key);
}

export interface UserMessage {
  title: string;
  action: string;
  fieldErrors: { field: string; message: string }[];
  correlationId: string;
}

/** Turns an error envelope into text for the screen. Unknown codes fall back to the catalogue, never to server text. */
export function userMessage(envelope: ErrorEnvelope, locale: string): UserMessage {
  const known = envelope.code in ERROR_CATALOGUE;
  const entry = known ? ERROR_CATALOGUE[envelope.code as keyof typeof ERROR_CATALOGUE] : ERROR_CATALOGUE.INTERNAL_ERROR;
  const title = translate(locale, `error.${known ? envelope.code : "INTERNAL_ERROR"}`);
  return {
    title: title.startsWith("error.") ? entry.message : title,
    action: entry.action,
    fieldErrors: envelope.fieldErrors,
    correlationId: envelope.correlationId,
  };
}

/** Connectivity source. Part 14 supplies the implementation (browser events and a health probe). */
export interface Connectivity {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

/** Scope the user is working in. Set from the server's resolved context; the server still re-checks every scope it receives. */
export interface WorkScope {
  companyId: string | null;
  projectId: string | null;
  siteId: string | null;
}

export function createScopeStore(initial: WorkScope = { companyId: null, projectId: null, siteId: null }) {
  let scope = initial;
  const listeners = new Set<(s: WorkScope) => void>();
  return {
    get: (): WorkScope => scope,
    set(next: Partial<WorkScope>): void {
      scope = { ...scope, ...next };
      for (const l of listeners) l(scope);
    },
    subscribe(listener: (s: WorkScope) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
