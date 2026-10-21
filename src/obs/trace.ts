// Trace context and spans (Part 09 REQ-OBS-F04; A-36 adapted, see D-062). W3C `traceparent` is read and written in-house, so no
// telemetry package is needed in S1. Spans are exported to a pluggable exporter; the default exporter drops them. Head sampling
// follows the parent's decision, or a configured rate at the root (A-44: 10 % for routes).
import { randomBytes, randomInt } from "node:crypto";
import { withCorrelation, currentCorrelation, type Correlation } from "./correlation";

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export interface TraceParent {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

/** Reads a W3C traceparent header. An invalid or all-zero value is ignored (returns null), so a caller cannot forge a trace id it does not own. */
export function parseTraceparent(header: string | null | undefined): TraceParent | null {
  if (!header) return null;
  const m = TRACEPARENT.exec(header.trim().toLowerCase());
  if (!m || /^0+$/.test(m[1]) || /^0+$/.test(m[2])) return null;
  return { traceId: m[1], spanId: m[2], sampled: (parseInt(m[3], 16) & 1) === 1 };
}

export function formatTraceparent(trace: { traceId: string; spanId: string; sampled: boolean }): string {
  return `00-${trace.traceId}-${trace.spanId}-${trace.sampled ? "01" : "00"}`;
}

export interface SpanRecord {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  sampled: boolean;
  durationMs: number;
  status: "ok" | "error";
  correlationId: string | null;
}

export type SpanExporter = (span: SpanRecord) => void;

let exporter: SpanExporter = () => undefined;
let rootSampleRate = 0.1;

export function setSpanExporter(next: SpanExporter): void {
  exporter = next;
}

export function setRootSampleRate(rate: number): void {
  if (!(rate >= 0 && rate <= 1)) throw new RangeError("the sample rate must be between 0 and 1");
  rootSampleRate = rate;
}

/** Runs `work` inside a span. Errors are recorded on the span and rethrown; the span is exported whether or not it is sampled out. */
export async function withSpan<T>(name: string, options: { correlationId: string; causationId?: string | null; parent?: TraceParent | null }, work: () => Promise<T>): Promise<T> {
  const parentSpan = currentCorrelation();
  const sampled = options.parent ? options.parent.sampled : randomInt(1_000_000) < rootSampleRate * 1_000_000;
  const traceId = options.parent?.traceId ?? parentSpan?.traceId ?? randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  const parentSpanId = options.parent?.spanId ?? parentSpan?.spanId ?? null;
  const correlation: Correlation = { correlationId: options.correlationId, causationId: options.causationId ?? null, traceId, spanId };
  const started = performance.now();
  let status: "ok" | "error" = "ok";
  try {
    return await withCorrelation(correlation, work);
  } catch (error) {
    status = "error";
    throw error;
  } finally {
    exporter({ name, traceId, spanId, parentSpanId, sampled, durationMs: Math.round((performance.now() - started) * 1000) / 1000, status, correlationId: options.correlationId });
  }
}
