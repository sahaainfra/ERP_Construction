// Role-space designer (Part 13 REQ-DASH-F04; CP-DASH-04). A designer proposes the widgets a role starts with. A second person publishes
// the proposal (maker-checker). Publication is an event (dash.space.published) written with the change, through the unit of work.
// The persona preview shows what a named person would see, using that person's own permissions, never the designer's.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { writeAudit } from "../secgov/audit";
import { can } from "../iam/pdp";
import { sameActor } from "../iam/actors";
import { LIVE_MODULES, findWidget } from "./registry";
import { permittedWidgets } from "./runtime";
import { WIDGETS } from "./widgets";
import { MAX_WIDGETS } from "./spaces";
import type { WidgetDefinition } from "./types";

export const DASH_PERMISSIONS = [
  { key: "dash.space.manage", module: "dash", description: "Propose role spaces and preview them", stage: "APPROVE", sensitivity: "sensitive" },
  { key: "dash.space.publish", module: "dash", description: "Publish a role space proposed by someone else", stage: "APPROVE", sensitivity: "privileged" },
] as const;

const ROLE_CODE = /^[a-z][a-z0-9_]{1,40}$/;
const USER_ID = /^[A-Z][A-Z0-9]{1,7}[0-9]{5,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure checks on a proposed space. Every widget must be registered, live, and listed once. */
export function spaceProblems(roleCode: string, widgetCodes: readonly string[], reason: string, defs: readonly WidgetDefinition[] = WIDGETS): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  if (!ROLE_CODE.test(roleCode)) problems.push({ field: "roleCode", message: "lower-case letters, digits and underscores" });
  if (widgetCodes.length === 0 || widgetCodes.length > MAX_WIDGETS) problems.push({ field: "widgetCodes", message: `between 1 and ${MAX_WIDGETS} widgets` });
  if (new Set(widgetCodes).size !== widgetCodes.length) problems.push({ field: "widgetCodes", message: "a widget is listed twice" });
  for (const code of widgetCodes) {
    const def = findWidget(code, defs);
    if (!def) problems.push({ field: code, message: "not a registered widget" });
    else if (!LIVE_MODULES.has(def.moduleCode)) problems.push({ field: code, message: `its module (${def.moduleCode}) is not live` });
  }
  if (reason.trim().length < 10) problems.push({ field: "reason", message: "at least 10 characters" });
  return problems;
}

async function requirePermission(pool: Pool, ctx: RequestContext, key: string): Promise<void> {
  const decision = await can(pool, ctx, key);
  if (!decision.allowed) throw new AppError("FORBIDDEN", decision.reason);
}

async function roleExists(pool: Pool, tenantId: string, roleCode: string): Promise<boolean> {
  return withTransaction(pool, async (c) => (await c.query("SELECT 1 FROM iam_roles WHERE tenant_id = $1 AND role_code = $2", [tenantId, roleCode])).rowCount === 1, { tenantId });
}

/** Proposes a space for a role. Returns the version. Nothing is shown to anyone until it is published. */
export async function proposeRoleSpace(pool: Pool, ctx: RequestContext, input: { roleCode: string; widgetCodes: string[]; reason: string }): Promise<{ version: number }> {
  await requirePermission(pool, ctx, "dash.space.manage");
  const problems = spaceProblems(input.roleCode, input.widgetCodes, input.reason);
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the role space is not valid", problems);
  if (!(await roleExists(pool, ctx.tenantId, input.roleCode))) throw new AppError("NOT_FOUND", "the role was not found");
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ version: number }>("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM ui_role_spaces WHERE tenant_id = $1 AND role_code = $2", [ctx.tenantId, input.roleCode]);
      const version = rows[0].version;
      await client.query(
        "INSERT INTO ui_role_spaces (tenant_id, role_code, version, widget_codes, status, created_by, reason) VALUES ($1, $2, $3, $4, 'proposed', $5, $6)",
        [ctx.tenantId, input.roleCode, version, input.widgetCodes, ctx.userId, input.reason],
      );
      await writeAudit(client, ctx, { action: "dash.space.proposed", entityType: "role_space", entityId: `${input.roleCode}#${version}`, reason: input.reason });
      return { version };
    },
    { tenantId: ctx.tenantId },
  );
}

/** Publishes a proposal. The publisher must not be the proposer. Publication supersedes the active space and emits the event. */
export async function publishRoleSpace(pool: Pool, ctx: RequestContext, input: { roleCode: string; version: number; reason: string }): Promise<void> {
  await requirePermission(pool, ctx, "dash.space.publish");
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short", [{ field: "reason", message: "at least 10 characters" }]);
  await runUnitOfWork(pool, ctx, async (uow) => {
    const { rows } = await uow.client.query<{ status: string; created_by: string; widget_codes: string[] }>(
      "SELECT status, created_by, widget_codes FROM ui_role_spaces WHERE tenant_id = $1 AND role_code = $2 AND version = $3 FOR UPDATE",
      [ctx.tenantId, input.roleCode, input.version],
    );
    if (rows.length === 0) throw new AppError("NOT_FOUND", "the role space version was not found");
    if (rows[0].status !== "proposed") throw new AppError("CONFLICT", "this version is no longer awaiting publication");
    if (await sameActor(uow.client, ctx.tenantId, rows[0].created_by, ctx.userId)) throw new AppError("MAKER_CHECKER_REQUIRED", "the person who proposed a space cannot publish it");
    // The widgets are checked again at publication: a module may have stopped being live since the proposal.
    const problems = spaceProblems(input.roleCode, rows[0].widget_codes, input.reason);
    if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the proposal no longer passes the checks", problems);
    await uow.client.query("UPDATE ui_role_spaces SET status = 'superseded' WHERE tenant_id = $1 AND role_code = $2 AND status = 'active'", [ctx.tenantId, input.roleCode]);
    await uow.client.query(
      "UPDATE ui_role_spaces SET status = 'active', approved_by = $4, approved_at = now() WHERE tenant_id = $1 AND role_code = $2 AND version = $3",
      [ctx.tenantId, input.roleCode, input.version, ctx.userId],
    );
    await uow.audit({ action: "dash.space.published", entityType: "role_space", entityId: `${input.roleCode}#${input.version}`, detail: { reason: input.reason } });
    await uow.emit({ eventType: "dash.space.published", payload: { roleCode: input.roleCode, version: input.version, widgetCount: rows[0].widget_codes.length }, aggregateKey: input.roleCode });
  });
}

export interface PersonaPreview {
  roleCode: string;
  version: number | null;
  visible: string[];
  hidden: string[];
}

/**
 * What a named person would see from a role's active space. The check uses the persona's own permissions. A widget the persona may not
 * see is listed as hidden, for the designer's information only; it is never shown on the persona's screen.
 */
export async function previewRoleSpace(pool: Pool, ctx: RequestContext, input: { roleCode: string; personaUserId: string }): Promise<PersonaPreview> {
  await requirePermission(pool, ctx, "dash.space.manage");
  if (!USER_ID.test(input.personaUserId) && !UUID.test(input.personaUserId)) throw new AppError("VALIDATION_FAILED", "the persona is not a valid user id");
  const active = await withTransaction(
    pool,
    async (c) => (await c.query<{ version: number; widget_codes: string[] }>("SELECT version, widget_codes FROM ui_role_spaces WHERE tenant_id = $1 AND role_code = $2 AND status = 'active'", [ctx.tenantId, input.roleCode])).rows[0] ?? null,
    { tenantId: ctx.tenantId },
  );
  if (!active) return { roleCode: input.roleCode, version: null, visible: [], hidden: [] };
  const persona = { ...ctx, userId: input.personaUserId };
  const visible = new Set((await permittedWidgets(pool, persona, active.widget_codes)).map((d) => d.code));
  return {
    roleCode: input.roleCode,
    version: active.version,
    visible: active.widget_codes.filter((c) => visible.has(c)),
    hidden: active.widget_codes.filter((c) => !visible.has(c)),
  };
}
