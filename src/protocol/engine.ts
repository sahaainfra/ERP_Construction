// Protocol evaluation (Part 17 REQ-PROTOCOL-F02, F04; CP-PROTOCOL-02; A-162, A-163, A-165). One evaluation runs inside the caller's transaction.
// Every control point evaluated is logged with the inputs it saw. In this slice every active control point runs in OBSERVE: a failure is
// recorded as "would block" or "would warn" and the action is allowed. WARN and ENFORCE are refused until the mode and impact-report
// slice (S3) exists, so nothing can be enforced by accident.
import type { Pool, PoolClient } from "pg";
import type { RequestContext } from "../core/context";
import type { ProtocolResult } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { preventiveCheck } from "../iam/sod";
import { fingerprintOf, runPureCheck } from "./checks";
import { activeControlPoints, type ActiveControlPoint, type Stage } from "./registry";

export interface EvaluateRequest {
  cpCodes?: string[];
  stage?: Stage;
  payload: Record<string, unknown>;
  /** For SOD and projects: the acting person, the record and the action. */
  actor?: string;
  entityType?: string;
  entityId?: string;
  projectId?: string | null;
  /** When true, a passing DUPLICATE check records its fingerprint. Only the committing caller sets this. */
  commit?: boolean;
}

export interface CpResult {
  cpCode: string;
  version: number;
  enforcement: ActiveControlPoint["enforcement"];
  mode: "OBSERVE";
  /** What the control point decided: PASS, UNAVAILABLE, or the failure its enforcement implies. */
  outcome: "PASS" | "UNAVAILABLE" | "FAIL";
  reasons: string[];
  /** The result as logged: in OBSERVE a failure is recorded as "would" the enforcement result. */
  logged: string;
}

export interface EvaluateResult {
  /** The result the action sees. In OBSERVE nothing is blocked. */
  result: ProtocolResult;
  /** The worst result the action would have seen under the enforcement levels. Shown for review, never applied in OBSERVE. */
  wouldBe: ProtocolResult;
  items: CpResult[];
}

const SEVERITY: ProtocolResult[] = ["PASS", "WARN", "EXCEPTION_REQUIRED", "BLOCK"];
const FAIL_RESULT: Record<ActiveControlPoint["enforcement"], ProtocolResult> = { BLOCK: "BLOCK", WARN: "WARN", EXCEPTION: "EXCEPTION_REQUIRED" };

async function decide(client: PoolClient, ctx: RequestContext, cp: ActiveControlPoint, req: EvaluateRequest): Promise<{ outcome: CpResult["outcome"]; reasons: string[] }> {
  if (cp.checkKind === "DUPLICATE") {
    const windowHours = Number(cp.params.windowHours);
    const fp = fingerprintOf(cp.params.fields as string[], req.payload);
    const prior = await client.query<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM protocol_fingerprints WHERE tenant_id = $1 AND cp_code = $2 AND fingerprint = $3 AND seen_at >= now() - make_interval(hours => $4::int) AND entity_id <> $5",
      [ctx.tenantId, cp.cpCode, fp, windowHours, req.entityId ?? ""],
    );
    const n = Number(prior.rows[0].n);
    if (n > 0) return { outcome: "FAIL", reasons: [`a matching record was submitted within ${windowHours} hours`] };
    if (req.commit && req.entityId) {
      await client.query("INSERT INTO protocol_fingerprints (tenant_id, cp_code, fingerprint, entity_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [ctx.tenantId, cp.cpCode, fp, req.entityId]);
    }
    return { outcome: "PASS", reasons: [] };
  }
  if (cp.checkKind === "SOD") {
    if (!req.actor || !req.entityType || !req.entityId || typeof cp.params.action !== "string") {
      return { outcome: "UNAVAILABLE", reasons: ["the segregation check needs the actor, the record and the action"] };
    }
    const violations = await preventiveCheck(client, ctx.tenantId, req.actor, cp.params.action, req.entityType, req.entityId, req.projectId ?? null);
    const bad = violations.filter((v) => v.enforcement === "enforce" && !v.covered);
    return bad.length ? { outcome: "FAIL", reasons: bad.map((v) => `segregation conflict with ${v.conflictingAction} (${v.ruleCode})`) } : { outcome: "PASS", reasons: [] };
  }
  const outcome = runPureCheck(cp.checkKind, cp.params, req.payload);
  if (outcome.status === "ok") return { outcome: "PASS", reasons: [] };
  if (outcome.status === "fail") return { outcome: "FAIL", reasons: [outcome.reason] };
  if (outcome.status === "unavailable") return { outcome: "UNAVAILABLE", reasons: [outcome.reason] };
  return { outcome: "PASS", reasons: [] };
}

/** Evaluates the matching active control points inside the caller's transaction, logs each one, and returns what the action sees. */
export async function evaluateControls(client: PoolClient, ctx: RequestContext, req: EvaluateRequest): Promise<EvaluateResult> {
  const cps = await activeControlPoints(client, ctx.tenantId, { cpCodes: req.cpCodes, stage: req.stage });
  const items: CpResult[] = [];
  for (const cp of cps) {
    const decided = await decide(client, ctx, cp, req);
    const logged = decided.outcome === "PASS" ? "PASS" : decided.outcome === "UNAVAILABLE" ? "UNAVAILABLE" : `WOULD_${cp.enforcement === "EXCEPTION" ? "EXCEPTION" : cp.enforcement}`;
    await client.query(
      `INSERT INTO protocol_evaluations (tenant_id, cp_code, cp_version, mode, enforcement, result, reasons, inputs, correlation_id)
       VALUES ($1, $2, $3, 'OBSERVE', $4, $5, $6, $7, $8)`,
      [ctx.tenantId, cp.cpCode, cp.version, cp.enforcement, logged, JSON.stringify(decided.reasons), JSON.stringify(req.payload), ctx.correlationId],
    );
    items.push({ cpCode: cp.cpCode, version: cp.version, enforcement: cp.enforcement, mode: "OBSERVE", outcome: decided.outcome === "FAIL" ? "FAIL" : decided.outcome, reasons: decided.reasons, logged });
  }
  let wouldBe: ProtocolResult = "PASS";
  for (const item of items) {
    const r: ProtocolResult = item.outcome === "FAIL" ? FAIL_RESULT[item.enforcement] : "PASS";
    if (SEVERITY.indexOf(r) > SEVERITY.indexOf(wouldBe)) wouldBe = r;
  }
  return { result: "PASS", wouldBe, items };
}

/**
 * What would block an action, and why, before the user starts it (REQ-PROTOCOL-F04). Read-only: nothing is logged and no fingerprint is recorded.
 */
export async function gateStatus(pool: Pool, ctx: RequestContext, req: EvaluateRequest): Promise<EvaluateResult> {
  return withTransaction(pool, async (client) => {
    const cps = await activeControlPoints(client, ctx.tenantId, { cpCodes: req.cpCodes, stage: req.stage });
    const items: CpResult[] = [];
    let wouldBe: ProtocolResult = "PASS";
    for (const cp of cps) {
      const decided = await decide(client, ctx, cp, req);
      const item: CpResult = { cpCode: cp.cpCode, version: cp.version, enforcement: cp.enforcement, mode: "OBSERVE", outcome: decided.outcome, reasons: decided.reasons, logged: decided.outcome };
      items.push(item);
      const r: ProtocolResult = item.outcome === "FAIL" ? FAIL_RESULT[cp.enforcement] : "PASS";
      if (SEVERITY.indexOf(r) > SEVERITY.indexOf(wouldBe)) wouldBe = r;
    }
    return { result: "PASS", wouldBe, items };
  }, { tenantId: ctx.tenantId });
}
