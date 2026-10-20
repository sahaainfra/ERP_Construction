// Structured logging with redaction (Part 05 REQ-CORE-F06; Part 09 REQ-OBS-F01, F02). JSON lines. Secret-like and personal-identifier
// keys are removed, and secret-like or personal values are masked inside strings (src/obs/redact.ts). The correlation scope
// of the running work is added to every line.
import { redactText } from "../obs/redact";
import { currentCorrelation } from "../obs/correlation";

export type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_TOKENS = new Set(["password", "passwd", "pass", "secret", "token", "authorization", "cookie", "apikey", "pan", "aadhaar", "aadhar", "otp", "cvv", "account", "bank", "ifsc", "salary", "phone", "email"]);

/**
 * True when a key names a sensitive value. The key is split into words (camelCase, underscores, hyphens) and each word is
 * matched exactly, so `companyId`, `span` or `expandedRows` are kept while `passwordHash`, `apiKey` or `panNumber` are removed.
 */
/** Paths of the keys in a value that name sensitive data, for example `a.b.passwordHash`. Used to refuse an event before it is stored. */
export function sensitivePaths(value: unknown, path = "", depth = 0): string[] {
  if (depth > 6 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => sensitivePaths(v, `${path}[${i}]`, depth + 1));
  return Object.entries(value).flatMap(([k, v]) => {
    const here = path ? `${path}.${k}` : k;
    return isSensitiveKey(k) ? [here] : sensitivePaths(v, here, depth + 1);
  });
}

export function isSensitiveKey(key: string): boolean {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((w) => SENSITIVE_TOKENS.has(w)) || words.join("").includes("apikey");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = isSensitiveKey(k) ? "[redacted]" : redact(v, depth + 1);
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
      const scope = currentCorrelation();
      const correlationId = base.correlationId ?? scope?.correlationId;
      const record: LogRecord = {
        ts: new Date().toISOString(),
        level,
        msg: redactText(msg),
        module: base.module,
        ...(correlationId ? { correlationId } : {}),
        ...(scope?.traceId ? { traceId: scope.traceId } : {}),
        ...(redact(fields) as Record<string, unknown>),
      };
      sink(JSON.stringify(record));
    },
    child(bindings) {
      return createLogger({ ...options, bindings: { ...base, ...bindings } });
    },
  };
  return logger;
}
