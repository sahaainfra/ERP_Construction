// Spaces (Part 13 REQ-DASH-F02; A-95). A viewer sees their own arrangement if they have one, else the active role space of their
// roles, else the default. Whatever the source, only the widgets the viewer may see are run.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { runWidgets, permittedWidgets, type Outcome, type RunOptions } from "./runtime";
import { findWidget } from "./registry";
import { WIDGETS } from "./widgets";

export const DEFAULT_SPACE: readonly string[] = ["my-projects-sites", "my-sign-ins", "security-alerts"];
export const MAX_WIDGETS = 20;

export type SpaceSource = "personal" | "role" | "default";
export interface EffectiveSpace {
  source: SpaceSource;
  widgets: { code: string; size: "s" | "m" | "l" }[];
}

async function roleCodesOf(client: PoolClient, tenantId: string, userId: string): Promise<string[]> {
  const { rows } = await client.query<{ role_code: string }>(
    `SELECT DISTINCT r.role_code
       FROM iam_user_role_assignments a JOIN iam_roles r ON r.id = a.role_id
      WHERE a.tenant_id = $1 AND a.user_ref = $2 AND a.approval_status = 'approved' AND a.revoked_at IS NULL
        AND a.valid_from <= CURRENT_DATE AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
      ORDER BY r.role_code`,
    [tenantId, userId],
  );
  return rows.map((r) => r.role_code);
}

/** The space a viewer sees, before filtering by permission. Role spaces are tried in role-code order; the first active one wins. */
export async function effectiveSpace(pool: Pool, ctx: RequestContext): Promise<EffectiveSpace> {
  return withTransaction(
    pool,
    async (client) => {
      const personal = await client.query<{ widgets: { code: string; size: "s" | "m" | "l" }[] }>("SELECT widgets FROM ui_user_space_overrides WHERE tenant_id = $1 AND user_id = $2", [ctx.tenantId, ctx.userId]);
      if (personal.rows.length > 0 && personal.rows[0].widgets.length > 0) return { source: "personal" as const, widgets: personal.rows[0].widgets };
      const roles = await roleCodesOf(client, ctx.tenantId, ctx.userId);
      if (roles.length > 0) {
        const role = await client.query<{ role_code: string; widget_codes: string[] }>(
          "SELECT role_code, widget_codes FROM ui_role_spaces WHERE tenant_id = $1 AND status = 'active' AND role_code = ANY($2::text[]) ORDER BY role_code LIMIT 1",
          [ctx.tenantId, roles],
        );
        if (role.rows.length > 0) return { source: "role" as const, widgets: role.rows[0].widget_codes.map((code) => ({ code, size: sizeFor(code) })) };
      }
      return { source: "default" as const, widgets: DEFAULT_SPACE.map((code) => ({ code, size: sizeFor(code) })) };
    },
    { tenantId: ctx.tenantId },
  );
}

function sizeFor(code: string): "s" | "m" | "l" {
  return findWidget(code, WIDGETS)?.sizes.includes("m") ? "m" : "s";
}

/** Runs the viewer's space: widgets they may see, in their order. */
export async function runSpace(pool: Pool, ctx: RequestContext, opts: RunOptions = {}): Promise<{ source: SpaceSource; outcomes: Outcome[] }> {
  const space = await effectiveSpace(pool, ctx);
  const outcomes = await runWidgets(pool, ctx, space.widgets.map((w) => w.code), opts);
  return { source: space.source, outcomes };
}

/** Stores the viewer's own arrangement. Every widget must exist, fit one of its sizes, and be visible to the viewer now. */
export async function setPersonalSpace(pool: Pool, ctx: RequestContext, widgets: { code: string; size: "s" | "m" | "l" }[], opts: RunOptions = {}): Promise<void> {
  const problems: { field: string; message: string }[] = [];
  if (widgets.length === 0 || widgets.length > MAX_WIDGETS) problems.push({ field: "widgets", message: `between 1 and ${MAX_WIDGETS} widgets` });
  const codes = widgets.map((w) => w.code);
  if (new Set(codes).size !== codes.length) problems.push({ field: "widgets", message: "a widget is listed twice" });
  for (const w of widgets) {
    const def = findWidget(w.code, opts.definitions ?? WIDGETS);
    if (!def || !def.sizes.includes(w.size)) problems.push({ field: w.code, message: "not a widget size you can use" });
  }
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the workspace is not valid", problems);
  const visible = new Set((await permittedWidgets(pool, ctx, codes, opts)).map((d) => d.code));
  for (const code of codes) {
    if (!visible.has(code)) problems.push({ field: code, message: "not available to you" });
  }
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "some widgets are not available to you", problems);
  await withTransaction(
    pool,
    (client) =>
      client.query(
        `INSERT INTO ui_user_space_overrides (tenant_id, user_id, widgets, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET widgets = EXCLUDED.widgets, updated_at = now()`,
        [ctx.tenantId, ctx.userId, JSON.stringify(widgets)],
      ),
    { tenantId: ctx.tenantId },
  );
}

/** Removes the viewer's arrangement, so the role space or the default applies again. */
export async function resetPersonalSpace(pool: Pool, ctx: RequestContext): Promise<void> {
  await withTransaction(pool, (client) => client.query("DELETE FROM ui_user_space_overrides WHERE tenant_id = $1 AND user_id = $2", [ctx.tenantId, ctx.userId]), { tenantId: ctx.tenantId });
}
