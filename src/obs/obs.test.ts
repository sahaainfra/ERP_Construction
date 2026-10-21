// Part 09 S1 tests: redaction, correlation in logs, metrics, trace context, and the telemetry contract (CP-OBS-01) for routes.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createLogger } from "../core/logger";
import { runRoute, type RouteSpec } from "../iam/pipeline";
import { redactText, verhoeffCheckDigit, verhoeffValid } from "./redact";
import { withCorrelation } from "./correlation";
import { counter, renderPrometheus, resetMetricValues, MAX_SERIES } from "./metrics";
import { formatTraceparent, parseTraceparent, setSpanExporter, withSpan, type SpanRecord } from "./trace";
import { ROUTE_REQUESTS, setTelemetryLogger } from "./telemetry";

function aadhaarWithCheck(payload11: string): string {
  return payload11 + verhoeffCheckDigit(payload11);
}

describe("value redaction (REQ-OBS-F02, A-39)", () => {
  it("masks PAN, valid Aadhaar, phone, email, tokens and OTP values inside free text", () => {
    const aadhaar = aadhaarWithCheck("23456789012");
    const text = `PAN ABCPE1234F, Aadhaar ${aadhaar.slice(0, 4)} ${aadhaar.slice(4, 8)} ${aadhaar.slice(8)}, phone 9876543210, mail asha.rao@example.in`;
    const out = redactText(text);
    expect(out).toBe("PAN [pan], Aadhaar [aadhaar], phone [phone], mail [email]");
    expect(redactText("Authorization: Bearer abc.def-123==")).toBe("Authorization: Bearer [token]");
    expect(redactText("session eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln ended")).toBe("session [token] ended");
    expect(redactText("your OTP is 482913")).toBe("your OTP is [otp]");
    expect(redactText("+91 98765 43210 on file")).toBe("[phone] on file");
  });

  it("keeps ordinary twelve-digit numbers that fail the Verhoeff check", () => {
    const valid = aadhaarWithCheck("23456789012");
    const wrong = valid.slice(0, 11) + String((Number(valid[11]) + 1) % 10);
    expect(verhoeffValid(valid)).toBe(true);
    expect(verhoeffValid(wrong)).toBe(false);
    expect(redactText(`ref ${wrong}`)).toBe(`ref ${wrong}`);
  });

  it("is idempotent and leaves plain business text alone", () => {
    const once = redactText("invoice INV-2026-0042 for 1,25,000.00 paise 999");
    expect(once).toBe("invoice INV-2026-0042 for 1,25,000.00 paise 999");
    expect(redactText(redactText("PAN ABCPE1234F"))).toBe("PAN [pan]");
  });
});

describe("logs carry the correlation scope (REQ-OBS-F01)", () => {
  it("adds the correlation and trace ids of the running work, and masks secrets in the message and fields", () => {
    const lines: string[] = [];
    const logger = createLogger({ sink: (line) => lines.push(line), bindings: { module: "test" } });
    withCorrelation({ correlationId: "corr-42", causationId: null, traceId: "a".repeat(32), spanId: "b".repeat(16) }, () => {
      logger.log("info", "note for PAN ABCPE1234F", { detail: "phone 9876543210" });
    });
    const record = JSON.parse(lines[0]) as Record<string, string>;
    expect(record).toMatchObject({ correlationId: "corr-42", traceId: "a".repeat(32), module: "test" });
    expect(record.msg).toBe("note for PAN [pan]");
    expect(record.detail).toBe("phone [phone]");
    expect(lines[0]).not.toContain("ABCPE1234F");
  });
});

describe("metrics (REQ-OBS-F03, A-37)", () => {
  beforeEach(() => resetMetricValues());

  it("renders Prometheus text with escaped labels, histogram buckets and the series-cap counter", () => {
    const hits = counter("obs_test_hits_total", "Test hits", ["path"]);
    hits.inc({ path: 'a"b\\c' }, 2);
    hits.inc({ path: 'a"b\\c' });
    expect(hits.value({ path: 'a"b\\c' })).toBe(3);
    const text = renderPrometheus();
    expect(text).toContain('# TYPE obs_test_hits_total counter');
    expect(text).toContain('obs_test_hits_total{path="a\\"b\\\\c"} 3');
    expect(text).toContain("obs_dropped_series_total 0");
  });

  it("drops label sets beyond the cap and counts them, so a bad label cannot exhaust memory", () => {
    const wide = counter("obs_test_wide_total", "Wide", ["id"]);
    for (let i = 0; i <= MAX_SERIES; i++) wide.inc({ id: `v${i}` });
    expect(wide.value({ id: `v${MAX_SERIES}` })).toBe(0);
    expect(renderPrometheus()).toMatch(/obs_dropped_series_total [1-9]/);
  });

  it("refuses an invalid metric name and a counter that goes down", () => {
    expect(() => counter("Bad-Name", "x")).toThrow(TypeError);
    const c = counter("obs_test_down_total", "Down");
    expect(() => c.inc({}, -1)).toThrow(RangeError);
  });
});

describe("trace context (REQ-OBS-F04, W3C traceparent)", () => {
  it("reads a valid traceparent and ignores forged or all-zero values", () => {
    const valid = "00-" + "1".repeat(32) + "-" + "2".repeat(16) + "-01";
    expect(parseTraceparent(valid)).toEqual({ traceId: "1".repeat(32), spanId: "2".repeat(16), sampled: true });
    expect(parseTraceparent("00-" + "0".repeat(32) + "-" + "2".repeat(16) + "-01")).toBeNull();
    expect(parseTraceparent("ff-" + "1".repeat(32) + "-" + "2".repeat(16) + "-01")).toBeNull();
    expect(parseTraceparent("garbage")).toBeNull();
    expect(formatTraceparent({ traceId: "1".repeat(32), spanId: "2".repeat(16), sampled: false })).toBe("00-" + "1".repeat(32) + "-" + "2".repeat(16) + "-00");
  });

  it("continues the parent trace, links the child span, and records errors on the span", async () => {
    const spans: SpanRecord[] = [];
    setSpanExporter((s) => spans.push(s));
    const parent = parseTraceparent("00-" + "3".repeat(32) + "-" + "4".repeat(16) + "-01");
    await withSpan("outer", { correlationId: "c-1", parent }, async () => {
      await withSpan("inner", { correlationId: "c-1" }, async () => undefined);
    }).catch(() => undefined);
    await withSpan("failing", { correlationId: "c-2", parent }, async () => {
      throw new Error("boom");
    }).catch(() => undefined);
    const inner = spans.find((s) => s.name === "inner")!;
    const outer = spans.find((s) => s.name === "outer")!;
    expect(outer.traceId).toBe("3".repeat(32));
    expect(outer.parentSpanId).toBe("4".repeat(16));
    expect(inner.traceId).toBe(outer.traceId);
    expect(inner.parentSpanId).toBe(outer.spanId);
    expect(spans.find((s) => s.name === "failing")!.status).toBe("error");
    setSpanExporter(() => undefined);
  });
});

describe("telemetry contract for routes (CP-OBS-01)", () => {
  const spec: RouteSpec = { name: "obs.test.echo", channel: "api", permissionKey: null, allowedFields: ["text"], auditAction: "obs.test.echo" };
  const pool = {} as Pool;
  let lines: string[];
  let spans: SpanRecord[];

  beforeEach(() => {
    resetMetricValues();
    lines = [];
    spans = [];
    setTelemetryLogger(createLogger({ sink: (line) => lines.push(line), bindings: { module: "obs" } }));
    setSpanExporter((s) => spans.push(s));
  });

  afterEach(() => {
    setSpanExporter(() => undefined);
  });

  it("a successful route emits a correlated log line, a RED sample and a span", async () => {
    const out = await runRoute(pool, null, spec, { text: "hello" }, {
      correlationId: "corr-route-1",
      handler: async (_ctx, input: { text: string }) => input.text.toUpperCase(),
    });
    expect(out).toBe("HELLO");
    const record = JSON.parse(lines.at(-1)!) as Record<string, unknown>;
    expect(record).toMatchObject({ msg: "route completed", route: "obs.test.echo", outcome: "ok", correlationId: "corr-route-1", level: "info" });
    expect(ROUTE_REQUESTS.value({ route: "obs.test.echo", outcome: "ok" })).toBe(1);
    expect(spans.find((s) => s.name === "route obs.test.echo")).toMatchObject({ status: "ok", correlationId: "corr-route-1" });
  });

  it("a refused route is counted as refused, not as an error, and still logs and spans", async () => {
    await expect(runRoute(pool, null, spec, { text: "x", extra: 1 }, { correlationId: "corr-route-2", handler: async () => "never" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const record = JSON.parse(lines.at(-1)!) as Record<string, unknown>;
    expect(record).toMatchObject({ outcome: "refused", errorCode: "VALIDATION_FAILED", level: "info" });
    expect(ROUTE_REQUESTS.value({ route: "obs.test.echo", outcome: "refused" })).toBe(1);
    expect(ROUTE_REQUESTS.value({ route: "obs.test.echo", outcome: "error" })).toBe(0);
  });

  it("an unexpected failure is an error at error level, and the original error is rethrown", async () => {
    await expect(runRoute(pool, null, spec, { text: "x" }, { correlationId: "corr-route-3", handler: async () => { throw new Error("db down"); } })).rejects.toThrow("db down");
    const record = JSON.parse(lines.at(-1)!) as Record<string, unknown>;
    expect(record).toMatchObject({ outcome: "error", errorCode: "UNEXPECTED", level: "error" });
    expect(ROUTE_REQUESTS.value({ route: "obs.test.echo", outcome: "error" })).toBe(1);
    expect(renderPrometheus()).toContain('route_requests_total{route="obs.test.echo",outcome="error"} 1');
  });
});
