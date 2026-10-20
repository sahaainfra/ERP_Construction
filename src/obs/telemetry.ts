// Route telemetry (Part 09 REQ-OBS-F01, F02, F03, F04): every route runs inside a correlated span, writes one structured log line and
// updates the RED metrics. Outcomes are split so that expected refusals (permission, validation, control) are not counted as
// errors: only `error` outcomes are errors for the SLO (S2).
import { AppError } from "../core/errors";
import { createLogger, type Logger } from "../core/logger";
import { counter, histogram } from "./metrics";
import { withSpan, type TraceParent } from "./trace";

export type RouteOutcome = "ok" | "refused" | "error";

/** Codes that are the caller's to fix or that a control produced. They are reported as `refused`, not as errors. */
const REFUSAL_CODES = new Set(["FORBIDDEN", "VALIDATION_FAILED", "NOT_FOUND", "CONFLICT", "PROTOCOL_BLOCKED", "MAKER_CHECKER_REQUIRED", "IDEMPOTENCY_PAYLOAD_MISMATCH", "IDEMPOTENCY_IN_PROGRESS"]);

export const ROUTE_REQUESTS = counter("route_requests_total", "Route calls by route and outcome", ["route", "outcome"]);
export const ROUTE_DURATION = histogram("route_duration_seconds", "Route call duration in seconds", ["route"], [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5]);

let logger: Logger = createLogger({ bindings: { module: "obs" } });

/** Replaces the telemetry logger (tests and the server bootstrap). */
export function setTelemetryLogger(next: Logger): void {
  logger = next;
}

export function telemetryLogger(): Logger {
  return logger;
}

export function outcomeOf(error: unknown): RouteOutcome {
  if (error instanceof AppError) return REFUSAL_CODES.has(error.code) ? "refused" : "error";
  return "error";
}

/** Runs one route call inside a span, with one log line and the RED counters. Rethrows the original error. */
export async function instrumentRoute<T>(route: string, options: { correlationId: string; causationId?: string | null; parent?: TraceParent | null }, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  let outcome: RouteOutcome = "ok";
  let errorCode: string | null = null;
  try {
    return await withSpan(`route ${route}`, options, work);
  } catch (error) {
    outcome = outcomeOf(error);
    errorCode = error instanceof AppError ? error.code : "UNEXPECTED";
    throw error;
  } finally {
    const seconds = (performance.now() - started) / 1000;
    ROUTE_REQUESTS.inc({ route, outcome });
    ROUTE_DURATION.observe({ route }, seconds);
    logger.log(outcome === "error" ? "error" : "info", "route completed", {
      route,
      outcome,
      durationMs: Math.round(seconds * 100000) / 100,
      errorCode,
      correlationId: options.correlationId,
    });
  }
}
