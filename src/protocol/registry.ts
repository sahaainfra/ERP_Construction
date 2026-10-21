// Control-point registry (Part 17 REQ-PROTOCOL-F01; CP-PROTOCOL-03; A-162, A-163). Control points are versioned data. A proposal is a draft.
// Activation is maker-checker: the author cannot activate it, and the version it replaces is retired. A new control point starts in OBSERVE.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { CHECK_KINDS, validateParams, type CheckKind } from "./checks";

export const STAGES = ["PLAN", "VERIFY", "APPROVE", "RECORD", "EXECUTE", "RECONCILE", "CLOSE", "MONITOR"] as const;
export type Stage = (typeof STAGES)[number];
export type Enforcement = "BLOCK" | "WARN" | "EXCEPTION";

export interface ProposeInput {
  cpCode: string;
  title: string;
  stage: Stage;
  checkKind: CheckKind;
  params: Record<string, unknown>;
  enforcement: Enforcement;
  ownerRole: string;
}

export interface ActiveControlPoint {
  cpCode: string;
  version: number;
  title: string;
  stage: Stage;
  checkKind: CheckKind;
  params: Record<string, unknown>;
  enforcement: Enforcement;
}

export function checkProposal(input: ProposeInput): void {
  if (!/^[A-Z][A-Z0-9_]{2,60}$/.test(input.cpCode)) throw new AppError("VALIDATION_FAILED", "the control point code must be upper-case letters, digits and underscores", [{ field: "cpCode", message: "format" }]);
  if (input.title.trim().length < 3) throw new AppError("VALIDATION_FAILED", "the title is too short", [{ field: "title", message: "too short" }]);
  if (!(STAGES as readonly string[]).includes(input.stage)) throw new AppError("VALIDATION_FAILED", "the stage is not one of the lifecycle stages", [{ field: "stage", message: "unknown" }]);
  if (!(CHECK_KINDS as readonly string[]).includes(input.checkKind)) throw new AppError("VALIDATION_FAILED", "the check kind is not in the library", [{ field: "checkKind", message: "unknown" }]);
  if (!["BLOCK", "WARN", "EXCEPTION"].includes(input.enforcement)) throw new AppError("VALIDATION_FAILED", "the enforcement is not valid", [{ field: "enforcement", message: "unknown" }]);
  const problems = validateParams(input.checkKind, input.params);
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", problems.join("; "), problems.map((m) => ({ field: "params", message: m })));
}

/** Proposes a draft version. Nothing is enforced until it is activated. */
export async function proposeControlPoint(pool: Pool, ctx: RequestContext, input: ProposeInput): Promise<{ version: number }> {
  checkProposal(input);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const { rows } = await uow.client.query<{ version: number }>("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM protocol_control_points WHERE tenant_id = $1 AND cp_code = $2", [ctx.tenantId, input.cpCode]);
    const version = Number(rows[0].version);
    await uow.client.query(
      `INSERT INTO protocol_control_points (tenant_id, cp_code, version, status, title, stage, check_kind, params, enforcement, owner_role, created_by)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10)`,
      [ctx.tenantId, input.cpCode, version, input.title, input.stage, input.checkKind, JSON.stringify(input.params), input.enforcement, input.ownerRole, ctx.userId],
    );
    await uow.audit({ action: "protocol.control_point.proposed", entityType: "control_point", entityId: `${input.cpCode}@${version}`, detail: { checkKind: input.checkKind, enforcement: input.enforcement } });
    return { version };
  });
}

/** Activates a draft. The author cannot. The version it replaces is retired. The new version starts in OBSERVE (A-163). */
export async function activateControlPoint(pool: Pool, ctx: RequestContext, input: { cpCode: string; version: number }): Promise<void> {
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ created_by: string; status: string }>("SELECT created_by, status FROM protocol_control_points WHERE tenant_id = $1 AND cp_code = $2 AND version = $3 FOR UPDATE", [ctx.tenantId, input.cpCode, input.version]);
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the control point version was not found");
    if (found.rows[0].status !== "draft") throw new AppError("CONFLICT", "only a draft version can be activated");
    if (found.rows[0].created_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the author cannot activate their own control point (CP-PROTOCOL-03)");
    await uow.client.query("UPDATE protocol_control_points SET status = 'retired' WHERE tenant_id = $1 AND cp_code = $2 AND status = 'active'", [ctx.tenantId, input.cpCode]);
    await uow.client.query("UPDATE protocol_control_points SET status = 'active', activated_by = $4, activated_at = now() WHERE tenant_id = $1 AND cp_code = $2 AND version = $3", [ctx.tenantId, input.cpCode, input.version, ctx.userId]);
    await uow.audit({ action: "protocol.control_point.activated", entityType: "control_point", entityId: `${input.cpCode}@${input.version}` });
    await uow.evaluate({ cpCode: "CP-PROTOCOL-03", result: "PASS", detail: { action: "activate", cpCode: input.cpCode, version: input.version } });
  });
}

/** The active versions, optionally narrowed to some codes or one stage. */
export async function activeControlPoints(client: PoolClient, tenantId: string, filter: { cpCodes?: string[]; stage?: Stage } = {}): Promise<ActiveControlPoint[]> {
  const { rows } = await client.query<{ cp_code: string; version: number; title: string; stage: Stage; check_kind: CheckKind; params: Record<string, unknown>; enforcement: Enforcement }>(
    `SELECT cp_code, version, title, stage, check_kind, params, enforcement FROM protocol_control_points
      WHERE tenant_id = $1 AND status = 'active' AND ($2::text[] IS NULL OR cp_code = ANY($2::text[])) AND ($3::text IS NULL OR stage = $3)
      ORDER BY cp_code`,
    [tenantId, filter.cpCodes ?? null, filter.stage ?? null],
  );
  return rows.map((r) => ({ cpCode: r.cp_code, version: r.version, title: r.title, stage: r.stage, checkKind: r.check_kind, params: r.params, enforcement: r.enforcement }));
}
