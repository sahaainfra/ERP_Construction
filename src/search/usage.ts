// Recent items (last 50 per person), favourites (up to 50) and command actions (Part 13 REQ-DASH-F09, F10). A person changes only their own
// lists. The palette offers an action only when its module is live, its route is live, and the person holds its permission.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { can } from "../iam/pdp";
import { LIVE_MODULES } from "../dash/registry";
import { LIVE_ROUTES } from "../design/navigation";
import type { EntityType } from "./query";

export const RECENT_LIMIT = 50;
export const FAVOURITE_LIMIT = 50;

export interface Item {
  entityType: EntityType;
  entityId: string;
  title: string;
  route: string;
}

export async function recordRecent(pool: Pool, ctx: RequestContext, item: Item): Promise<void> {
  if (!item.route.startsWith("/")) throw new AppError("VALIDATION_FAILED", "the route is not valid");
  await withTransaction(
    pool,
    async (c) => {
      await c.query(
        `INSERT INTO usr_recent (tenant_id, user_id, entity_type, entity_id, title, route, opened_at) VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (tenant_id, user_id, entity_type, entity_id) DO UPDATE SET title = EXCLUDED.title, route = EXCLUDED.route, opened_at = now()`,
        [ctx.tenantId, ctx.userId, item.entityType, item.entityId, item.title, item.route],
      );
      await c.query(
        `DELETE FROM usr_recent WHERE tenant_id = $1 AND user_id = $2 AND (entity_type, entity_id) NOT IN (
           SELECT entity_type, entity_id FROM usr_recent WHERE tenant_id = $1 AND user_id = $2 ORDER BY opened_at DESC LIMIT $3)`,
        [ctx.tenantId, ctx.userId, RECENT_LIMIT],
      );
    },
    { tenantId: ctx.tenantId },
  );
}

export async function listRecent(pool: Pool, ctx: RequestContext): Promise<Item[]> {
  return withTransaction(
    pool,
    async (c) => (await c.query<{ entity_type: EntityType; entity_id: string; title: string; route: string }>(
      "SELECT entity_type, entity_id, title, route FROM usr_recent WHERE tenant_id = $1 AND user_id = $2 ORDER BY opened_at DESC LIMIT $3",
      [ctx.tenantId, ctx.userId, RECENT_LIMIT],
    )).rows.map((r) => ({ entityType: r.entity_type, entityId: r.entity_id, title: r.title, route: r.route })),
    { tenantId: ctx.tenantId },
  );
}

export async function addFavourite(pool: Pool, ctx: RequestContext, item: Item): Promise<void> {
  await withTransaction(
    pool,
    async (c) => {
      const count = await c.query<{ n: string }>("SELECT count(*) AS n FROM usr_favourites WHERE tenant_id = $1 AND user_id = $2", [ctx.tenantId, ctx.userId]);
      if (Number(count.rows[0].n) >= FAVOURITE_LIMIT) throw new AppError("VALIDATION_FAILED", `at most ${FAVOURITE_LIMIT} favourites`);
      await c.query(
        "INSERT INTO usr_favourites (tenant_id, user_id, entity_type, entity_id, title, route) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
        [ctx.tenantId, ctx.userId, item.entityType, item.entityId, item.title, item.route],
      );
    },
    { tenantId: ctx.tenantId },
  );
}

export async function removeFavourite(pool: Pool, ctx: RequestContext, entityType: EntityType, entityId: string): Promise<void> {
  await withTransaction(pool, (c) => c.query("DELETE FROM usr_favourites WHERE tenant_id = $1 AND user_id = $2 AND entity_type = $3 AND entity_id = $4", [ctx.tenantId, ctx.userId, entityType, entityId]), { tenantId: ctx.tenantId });
}

export async function listFavourites(pool: Pool, ctx: RequestContext): Promise<Item[]> {
  return withTransaction(
    pool,
    async (c) => (await c.query<{ entity_type: EntityType; entity_id: string; title: string; route: string }>(
      "SELECT entity_type, entity_id, title, route FROM usr_favourites WHERE tenant_id = $1 AND user_id = $2 ORDER BY added_at",
      [ctx.tenantId, ctx.userId],
    )).rows.map((r) => ({ entityType: r.entity_type, entityId: r.entity_id, title: r.title, route: r.route })),
    { tenantId: ctx.tenantId },
  );
}

/** Command actions (REQ-DASH-F09). Registered in code, like the widgets (A-94). */
export interface CommandAction {
  code: string;
  label: string;
  route: string;
  moduleCode: string;
  permissionKey: string | null;
  entityType: EntityType | null;
}

export const COMMAND_ACTIONS: CommandAction[] = [
  { code: "open-security-events", label: "Open security events", route: "/security/events", moduleCode: "secgov", permissionKey: "secgov.security.view", entityType: null },
  { code: "open-my-sign-ins", label: "My sign-ins", route: "/account/sign-ins", moduleCode: "auth", permissionKey: null, entityType: null },
  { code: "open-my-projects", label: "My projects and sites", route: "/projects", moduleCode: "org", permissionKey: null, entityType: null },
];

/** The actions the viewer may run now, filtered by module, route and permission. Context actions for a record are added by the owning Parts. */
export async function commandActions(pool: Pool, ctx: RequestContext, opts: { liveModules?: ReadonlySet<string>; liveRoutes?: ReadonlySet<string>; actions?: CommandAction[] } = {}): Promise<CommandAction[]> {
  const live = opts.liveModules ?? LIVE_MODULES;
  const routes = opts.liveRoutes ?? LIVE_ROUTES;
  const out: CommandAction[] = [];
  for (const a of opts.actions ?? COMMAND_ACTIONS) {
    if (!live.has(a.moduleCode) || !routes.has(a.route)) continue;
    if (a.permissionKey !== null && !(await can(pool, ctx, a.permissionKey)).allowed) continue;
    out.push(a);
  }
  return out;
}
