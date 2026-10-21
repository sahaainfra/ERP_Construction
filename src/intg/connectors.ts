// Connector registry, guarded call and monitor (Part 11 REQ-INTG-F01, F16; A-67). Every outbound call runs through `callConnector`:
// destination and status checks, a circuit breaker, a timeout, retries only for idempotent operations, and one message row per
// attempt. A connector reads `active` only after a successful real call in this environment (A-67).
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { sensitivePaths } from "../core/logger";
import { withTransaction } from "../db/transactions";
import { writeAudit } from "../secgov/audit";
import { can } from "../iam/pdp";
import { counter, histogram } from "../obs/metrics";
import { CircuitBreaker, DEFAULT_BREAKER, type BreakerOptions } from "./breaker";
import { hostProblem } from "./ssrf";

export const INTG_PERMISSIONS = [
  { key: "intg.connector.manage", module: "intg", description: "Register connectors, allow-lists and mappings", stage: "APPROVE", sensitivity: "privileged" },
  { key: "intg.credential.manage", module: "intg", description: "Propose a connector secret (encrypted at once; shown never again)", stage: "APPROVE", sensitivity: "privileged" },
  { key: "intg.credential.approve", module: "intg", description: "Approve a connector secret proposed by someone else", stage: "APPROVE", sensitivity: "privileged" },
] as const;

export const CONNECTOR_CODE = /^[a-z][a-z0-9_]{1,40}$/;
const MAX_HOSTS = 10;
const STALE_AFTER_MS = 60 * 60 * 1000;

export const CONNECTOR_CALLS = counter("intg_connector_calls_total", "Connector calls by connector and outcome", ["connector", "outcome"]);
export const CONNECTOR_LATENCY = histogram("intg_connector_latency_seconds", "Connector call duration in seconds", ["connector"], [0.1, 0.5, 1, 2.5, 5, 10, 30]);

export interface ConnectorRow {
  code: string;
  connectorType: string;
  status: "configured_untested" | "active" | "unavailable" | "failed";
  allowedHosts: string[];
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
}

export interface NewConnector {
  code: string;
  connectorType: string;
  allowedHosts: string[];
  config?: Record<string, unknown>;
  reason: string;
}

async function requirePermission(pool: Pool, ctx: RequestContext, key: string): Promise<void> {
  const decision = await can(pool, ctx, key);
  if (!decision.allowed) throw new AppError("FORBIDDEN", decision.reason);
}

/** Registers a connector. It starts as `configured_untested`: it is not active until a real call succeeds (A-67). */
export async function createConnector(pool: Pool, ctx: RequestContext, input: NewConnector): Promise<void> {
  await requirePermission(pool, ctx, "intg.connector.manage");
  const problems: { field: string; message: string }[] = [];
  if (!CONNECTOR_CODE.test(input.code)) problems.push({ field: "code", message: "lower-case letters, digits and underscores; starts with a letter" });
  if (!CONNECTOR_CODE.test(input.connectorType)) problems.push({ field: "connectorType", message: "lower-case letters, digits and underscores" });
  if (input.allowedHosts.length === 0 || input.allowedHosts.length > MAX_HOSTS) problems.push({ field: "allowedHosts", message: `one to ${MAX_HOSTS} host names` });
  for (const host of input.allowedHosts) {
    const problem = hostProblem(host);
    if (problem) problems.push({ field: "allowedHosts", message: `${host}: ${problem}` });
  }
  if (new Set(input.allowedHosts).size !== input.allowedHosts.length) problems.push({ field: "allowedHosts", message: "a host is listed twice" });
  const sensitive = sensitivePaths(input.config ?? {});
  for (const field of sensitive) problems.push({ field: `config.${field}`, message: "secrets are stored only through the credential vault" });
  if (input.reason.trim().length < 10) problems.push({ field: "reason", message: "at least 10 characters" });
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the connector is not valid", problems);

  await withTransaction(
    pool,
    async (client) => {
      const exists = await client.query("SELECT 1 FROM intg_connectors WHERE tenant_id = $1 AND code = $2", [ctx.tenantId, input.code]);
      if ((exists.rowCount ?? 0) > 0) throw new AppError("CONFLICT", "a connector with this code already exists");
      await client.query(
        "INSERT INTO intg_connectors (tenant_id, code, connector_type, allowed_hosts, config, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
        [ctx.tenantId, input.code, input.connectorType, input.allowedHosts, JSON.stringify(input.config ?? {}), ctx.userId],
      );
      await writeAudit(client, ctx, { action: "intg.connector.created", entityType: "connector", entityId: input.code, after: { connectorType: input.connectorType, hosts: input.allowedHosts.length }, reason: input.reason });
    },
    { tenantId: ctx.tenantId },
  );
}

/** Marks a connector unavailable in this environment (for example, a device or credential that does not exist here). */
export async function setUnavailable(pool: Pool, ctx: RequestContext, code: string, reason: string): Promise<void> {
  await requirePermission(pool, ctx, "intg.connector.manage");
  if (reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short", [{ field: "reason", message: "at least 10 characters" }]);
  await withTransaction(
    pool,
    async (client) => {
      const { rowCount } = await client.query("UPDATE intg_connectors SET status = 'unavailable' WHERE tenant_id = $1 AND code = $2", [ctx.tenantId, code]);
      if (rowCount === 0) throw new AppError("NOT_FOUND", "the connector was not found");
      await writeAudit(client, ctx, { action: "intg.connector.unavailable", entityType: "connector", entityId: code, after: { status: "unavailable" }, reason });
    },
    { tenantId: ctx.tenantId },
  );
}

const breakers = new Map<string, CircuitBreaker>();

/** One breaker per tenant and connector, in process memory (see breaker.ts). */
export function breakerFor(tenantId: string, code: string, options: BreakerOptions = DEFAULT_BREAKER): CircuitBreaker {
  const key = `${tenantId}:${code}`;
  let breaker = breakers.get(key);
  if (!breaker) {
    breaker = new CircuitBreaker(options);
    breakers.set(key, breaker);
  }
  return breaker;
}

/** Test support: forgets every breaker. */
export function resetBreakers(): void {
  breakers.clear();
}

export interface CallSpec {
  tenantId: string;
  connectorCode: string;
  operation: string;
  correlationId: string;
  /** Only an idempotent operation is retried. A non-idempotent one is attempted once. */
  idempotent: boolean;
  maxAttempts?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  payloadHash?: string | null;
  breaker?: BreakerOptions;
}

async function loadConnector(client: PoolClient, tenantId: string, code: string): Promise<ConnectorRow> {
  const { rows } = await client.query<{ code: string; connector_type: string; status: ConnectorRow["status"]; allowed_hosts: string[]; consecutive_failures: number; last_success_at: Date | null; last_failure_at: Date | null }>(
    "SELECT code, connector_type, status, allowed_hosts, consecutive_failures, last_success_at, last_failure_at FROM intg_connectors WHERE tenant_id = $1 AND code = $2",
    [tenantId, code],
  );
  if (rows.length === 0) throw new AppError("NOT_FOUND", "the connector was not found");
  const r = rows[0];
  return { code: r.code, connectorType: r.connector_type, status: r.status, allowedHosts: r.allowed_hosts, consecutiveFailures: r.consecutive_failures, lastSuccessAt: r.last_success_at, lastFailureAt: r.last_failure_at };
}

async function recordMessage(pool: Pool, spec: CallSpec, outcome: { status: "succeeded" | "failed" | "refused"; attempts: number; durationMs: number; errorCode: string | null }): Promise<void> {
  await withTransaction(
    pool,
    async (client) => {
      await client.query(
        "INSERT INTO intg_messages (tenant_id, connector_code, operation, direction, correlation_id, status, attempts, duration_ms, error_code, payload_hash) VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9)",
        [spec.tenantId, spec.connectorCode, spec.operation, spec.correlationId, outcome.status, outcome.attempts, outcome.durationMs, outcome.errorCode, spec.payloadHash ?? null],
      );
    },
    { tenantId: spec.tenantId },
  );
  CONNECTOR_CALLS.inc({ connector: spec.connectorCode, outcome: outcome.status });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs one outbound operation for a connector. `work` receives an abort signal that fires at the timeout. Throws an AppError the
 * caller can show: a refused destination or status is refused at once; a failing call is retried (idempotent only) and then
 * reported as SERVICE_UNAVAILABLE with the connector's name.
 */
export async function callConnector<T>(pool: Pool, spec: CallSpec, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const connector = await withTransaction(pool, (client) => loadConnector(client, spec.tenantId, spec.connectorCode), { tenantId: spec.tenantId });
  const started = performance.now();
  if (connector.status === "unavailable") {
    await recordMessage(pool, spec, { status: "refused", attempts: 1, durationMs: 0, errorCode: "SERVICE_UNAVAILABLE" });
    throw new AppError("SERVICE_UNAVAILABLE", `${spec.connectorCode} is not available in this environment`);
  }
  const breaker = breakerFor(spec.tenantId, spec.connectorCode, spec.breaker);
  if (!breaker.allow()) {
    await recordMessage(pool, spec, { status: "refused", attempts: 1, durationMs: 0, errorCode: "SERVICE_UNAVAILABLE" });
    const seconds = Math.ceil(breaker.retryAfterMs() / 1000);
    throw new AppError("SERVICE_UNAVAILABLE", `${spec.connectorCode} is paused after repeated failures; retry in about ${seconds} seconds`);
  }

  const maxAttempts = spec.idempotent ? (spec.maxAttempts ?? 3) : 1;
  let attempts = 0;
  let lastError: unknown = null;
  let opened = false;
  while (attempts < maxAttempts) {
    attempts++;
    const attemptStart = performance.now();
    try {
      const result = await work(AbortSignal.timeout(spec.timeoutMs ?? 10_000));
      breaker.success();
      CONNECTOR_LATENCY.observe({ connector: spec.connectorCode }, (performance.now() - attemptStart) / 1000);
      await withTransaction(
        pool,
        async (client) => {
          await client.query(
            "UPDATE intg_connectors SET last_success_at = now(), consecutive_failures = 0, status = CASE WHEN status IN ('configured_untested', 'failed') THEN 'active' ELSE status END WHERE tenant_id = $1 AND code = $2",
            [spec.tenantId, spec.connectorCode],
          );
        },
        { tenantId: spec.tenantId },
      );
      await recordMessage(pool, spec, { status: "succeeded", attempts, durationMs: Math.round(performance.now() - started), errorCode: null });
      return result;
    } catch (error) {
      if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "VALIDATION_FAILED")) {
        await recordMessage(pool, spec, { status: "refused", attempts, durationMs: Math.round(performance.now() - started), errorCode: error.code });
        throw error;
      }
      lastError = error;
      if (breaker.failure()) {
        opened = true;
        break;
      }
      if (attempts < maxAttempts) await sleep((spec.retryDelayMs ?? 250) * 2 ** (attempts - 1));
    }
  }

  await withTransaction(
    pool,
    async (client) => {
      await client.query(
        "UPDATE intg_connectors SET last_failure_at = now(), consecutive_failures = consecutive_failures + 1, status = CASE WHEN $3::boolean THEN 'failed' ELSE status END WHERE tenant_id = $1 AND code = $2",
        [spec.tenantId, spec.connectorCode, opened],
      );
    },
    { tenantId: spec.tenantId },
  );
  await recordMessage(pool, spec, { status: "failed", attempts, durationMs: Math.round(performance.now() - started), errorCode: "SERVICE_UNAVAILABLE" });
  const reason = lastError instanceof Error ? lastError.name : "unknown error";
  throw new AppError("SERVICE_UNAVAILABLE", `${spec.connectorCode} did not respond (${reason}); the request was not completed. Try again later.`);
}

export interface ConnectorStatus extends ConnectorRow {
  breaker: string;
  stale: boolean;
}

/** The monitor view: status, last success and failure, breaker state, and whether the last success is too old (INTEGRATION_STALE). */
export async function connectorStatus(pool: Pool, ctx: RequestContext, now: Date = new Date()): Promise<ConnectorStatus[]> {
  await requirePermission(pool, ctx, "intg.connector.manage");
  const rows = await withTransaction(
    pool,
    async (client) => {
      const { rows: list } = await client.query<{ code: string; connector_type: string; status: ConnectorRow["status"]; allowed_hosts: string[]; consecutive_failures: number; last_success_at: Date | null; last_failure_at: Date | null }>(
        "SELECT code, connector_type, status, allowed_hosts, consecutive_failures, last_success_at, last_failure_at FROM intg_connectors WHERE tenant_id = $1 ORDER BY code",
        [ctx.tenantId],
      );
      return list;
    },
    { tenantId: ctx.tenantId },
  );
  return rows.map((r) => ({
    code: r.code,
    connectorType: r.connector_type,
    status: r.status,
    allowedHosts: r.allowed_hosts,
    consecutiveFailures: r.consecutive_failures,
    lastSuccessAt: r.last_success_at,
    lastFailureAt: r.last_failure_at,
    breaker: breakers.get(`${ctx.tenantId}:${r.code}`)?.current() ?? "closed",
    stale: r.status === "active" && (!r.last_success_at || now.getTime() - r.last_success_at.getTime() > STALE_AFTER_MS),
  }));
}
