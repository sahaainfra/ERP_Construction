// Per-user display preferences, server side (Part 12 REQ-DS-F10; A-78). A user reads and changes only their own row. The values
// are validated against the same lists the client uses, and pinned routes must be live entries the user can open (checked by the
// caller with `navigationFor`, so a pinned route can never point at a page the user may not see).
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { LIVE_ROUTES } from "./navigation";

export const THEME_VALUES = ["system", "light", "dark", "high-contrast"] as const;
export const DENSITY_VALUES = ["compact", "cozy", "touch"] as const;
export const MAX_PINNED = 10;

export interface UserPreferences {
  theme: (typeof THEME_VALUES)[number];
  density: (typeof DENSITY_VALUES)[number];
  navCollapsed: boolean;
  pinned: string[];
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = { theme: "system", density: "cozy", navCollapsed: false, pinned: [] };

export interface PreferencesPatch {
  theme?: string;
  density?: string;
  navCollapsed?: boolean;
  pinned?: string[];
}

/** Pure validation of a patch. Returns the problems; an empty list means the patch may be stored. */
export function preferencesProblems(patch: PreferencesPatch, openRoutes: ReadonlySet<string> = LIVE_ROUTES): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  if (patch.theme !== undefined && !(THEME_VALUES as readonly string[]).includes(patch.theme)) problems.push({ field: "theme", message: `one of ${THEME_VALUES.join(", ")}` });
  if (patch.density !== undefined && !(DENSITY_VALUES as readonly string[]).includes(patch.density)) problems.push({ field: "density", message: `one of ${DENSITY_VALUES.join(", ")}` });
  if (patch.navCollapsed !== undefined && typeof patch.navCollapsed !== "boolean") problems.push({ field: "navCollapsed", message: "true or false" });
  if (patch.pinned !== undefined) {
    if (patch.pinned.length > MAX_PINNED) problems.push({ field: "pinned", message: `at most ${MAX_PINNED} pinned pages` });
    if (new Set(patch.pinned).size !== patch.pinned.length) problems.push({ field: "pinned", message: "a page is pinned twice" });
    for (const route of patch.pinned) {
      if (!openRoutes.has(route)) problems.push({ field: "pinned", message: `${route} is not a page you can open` });
    }
  }
  return problems;
}

export async function getUserPreferences(pool: Pool, ctx: RequestContext): Promise<UserPreferences> {
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ theme: UserPreferences["theme"]; density: UserPreferences["density"]; nav_collapsed: boolean; pinned: string[] }>(
        "SELECT theme, density, nav_collapsed, pinned FROM ui_user_preferences WHERE tenant_id = $1 AND user_id = $2",
        [ctx.tenantId, ctx.userId],
      );
      if (rows.length === 0) return { ...DEFAULT_USER_PREFERENCES, pinned: [] };
      return { theme: rows[0].theme, density: rows[0].density, navCollapsed: rows[0].nav_collapsed, pinned: rows[0].pinned };
    },
    { tenantId: ctx.tenantId },
  );
}

/** Applies a patch to the signed-in user's own preferences and returns the stored result. */
export async function setUserPreferences(pool: Pool, ctx: RequestContext, patch: PreferencesPatch, openRoutes: ReadonlySet<string> = LIVE_ROUTES): Promise<UserPreferences> {
  const problems = preferencesProblems(patch, openRoutes);
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the preferences are not valid", problems);
  const current = await getUserPreferences(pool, ctx);
  const next: UserPreferences = {
    theme: (patch.theme as UserPreferences["theme"] | undefined) ?? current.theme,
    density: (patch.density as UserPreferences["density"] | undefined) ?? current.density,
    navCollapsed: patch.navCollapsed ?? current.navCollapsed,
    pinned: patch.pinned ?? current.pinned,
  };
  await withTransaction(
    pool,
    async (client) => {
      await client.query(
        `INSERT INTO ui_user_preferences (tenant_id, user_id, theme, density, nav_collapsed, pinned, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET theme = EXCLUDED.theme, density = EXCLUDED.density, nav_collapsed = EXCLUDED.nav_collapsed, pinned = EXCLUDED.pinned, updated_at = now()`,
        [ctx.tenantId, ctx.userId, next.theme, next.density, next.navCollapsed, next.pinned],
      );
    },
    { tenantId: ctx.tenantId },
  );
  return next;
}
