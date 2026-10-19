// Structured logging with redaction (Part 05 REQ-CORE-F06). JSON lines; secret-like and personal-identifier keys are removed.
export type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[_-]?key|pan|aadhaar|aadhar|account|salary|bank|phone|email/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

export interface LogRecord {
  level: Level;
  msg: string;
  module: string;
  correlationId?: string;
  [key: string]: unknown;
}

export interface Logger {
  log(level: Level, msg: string, fields?: Record<string, unknown>): void;
  child(bindings: { module: string; correlationId?: string }): Logger;
}

export function createLogger(options: {
  minLevel?: Level;
  sink?: (line: string) => void;
  levels?: Record<string, Level>;
  bindings?: { module: string; correlationId?: string };
}): Logger {
  const sink = options.sink ?? ((line: string) => process.stdout.write(line + "\n"));
  const base = options.bindings ?? { module: "app" };
  const minFor = (module: string): Level => options.levels?.[module] ?? options.minLevel ?? "info";
  const logger: Logger = {
    log(level, msg, fields = {}) {
      if (ORDER[level] < ORDER[minFor(base.module)]) return;
      const record: LogRecord = { ts: new Date().toISOString(), level, msg, module: base.module, ...(base.correlationId ? { correlationId: base.correlationId } : {}), ...(redact(fields) as Record<string, unknown>) };
      sink(JSON.stringify(record));
    },
    child(bindings) {
      return createLogger({ ...options, bindings: { ...base, ...bindings } });
    },
  };
  return logger;
}
