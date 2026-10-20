// Zero-trust request pipeline (Part 07 slice S5; REQ-IAM-F21): Authenticate → Authorise → Validate → Execute → Audit. Every
// handler runs through `runRoute`. The session must already be verified by the caller (token signature and expiry: S1
// `verifyAccess`). Scope is derived on the server, never copied from the request, and client-supplied ids are authorised against
// the record they name (`resource` loads it from the database).
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import { buildContext, type Channel, type RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { instrumentRoute } from "../obs/telemetry";
import { can } from "./pdp";
import type { Resource } from "./policy";

export interface RouteSession {
  tenantId: string;
  companyId: string;
  userId: string;
  sessionId: string;
}

export interface RouteSpec {
  /** Route name as it appears in the route registry. */
  name: string;
  channel: Channel;
  /** The permission the caller needs. `null` only for a public route, which must say why in the registry. */
  permissionKey: string | null;
  /** The only fields the request may carry. Anything else is refused (no mass assignment). */
  allowedFields: readonly string[];
  /** The audit action written after the handler succeeds. */
  auditAction: string;
}

export interface RouteOptions<I, R> {
  correlationId: string;
  /** Loads the record a request names, from the database, so that the check is made against the real record. */
  resource?: (input: Partial<I>) => Promise<Resource | undefined>;
  handler: (ctx: RequestContext, input: I) => Promise<R>;
}

/** Every route runs inside a correlated span with one log line and the RED counters (Part 09 REQ-OBS-F01, F03, F04). */
export function runRoute<I extends Record<string, unknown>, R>(pool: Pool, session: RouteSession | null, spec: RouteSpec, input: unknown, options: RouteOptions<I, R>): Promise<R> {
  return instrumentRoute(spec.name, { correlationId: options.correlationId }, () => executeRoute(pool, session, spec, input, options));
}

async function executeRoute<I extends Record<string, unknown>, R>(pool: Pool, session: RouteSession | null, spec: RouteSpec, input: unknown, options: RouteOptions<I, R>): Promise<R> {
  // 1. Authenticate.
  let ctx: RequestContext | null = null;
  if (spec.permissionKey !== null) {
    if (!session) throw new AppError("FORBIDDEN", "you are not signed in");
    ctx = buildContext(
      { tenantId: session.tenantId, companyId: session.companyId, projectIds: [], siteIds: [], userId: session.userId, roles: [], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
      spec.channel,
      options.correlationId,
    );
  }
  // 2. Authorise (before the input is trusted: the resource is looked up by the ids the request names, and refused if absent).
  if (spec.permissionKey !== null && ctx) {
    const raw = (typeof input === "object" && input !== null ? input : {}) as Partial<I>;
    const resource = options.resource ? await options.resource(raw) : undefined;
    const decision = await can(pool, ctx, spec.permissionKey, resource);
    if (!decision.allowed) throw new AppError("FORBIDDEN", decision.reason);
  }
  // 3. Validate: the body must be an object and carry only the allowed fields.
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new AppError("VALIDATION_FAILED", "the request body must be an object");
  const unknown = Object.keys(input).filter((k) => !spec.allowedFields.includes(k));
  if (unknown.length > 0) {
    throw new AppError("VALIDATION_FAILED", `unknown field(s): ${unknown.join(", ")}`, unknown.map((field) => ({ field, message: "not accepted by this route" })));
  }
  // 4. Execute.
  const executor = ctx ?? buildContext({ tenantId: "00000000-0000-4000-8000-000000000000", companyId: "public", projectIds: [], siteIds: [], userId: "00000000-0000-4000-8000-000000000000", roles: [], permissionSnapshotVersion: 0, locale: "en-IN", timezone: "Asia/Kolkata" }, spec.channel, options.correlationId);
  const result = await options.handler(executor, input as I);
  // 5. Audit: the route's own action is recorded for authenticated calls.
  if (ctx) {
    await runUnitOfWork(pool, ctx, async (uow) => {
      await uow.audit({ action: spec.auditAction, entityType: "route", entityId: spec.name, detail: { channel: spec.channel } });
    });
  }
  return result;
}
