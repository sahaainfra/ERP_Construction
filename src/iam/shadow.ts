// Legacy shadow mode (Part 07 slice S4; REQ-IAM-F13). The new engine's decision is compared with the legacy decision and every
// comparison is kept. Switch-over is judged on counts. The repository has no legacy authorisation to compare against yet, so
// this is the mechanism only: nothing calls it until a legacy module exists.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";

export async function recordComparison(pool: Pool, ctx: RequestContext, c: { moduleCode: string; actionKey: string; legacyAllowed: boolean; engineAllowed: boolean }): Promise<boolean> {
  const matched = c.legacyAllowed === c.engineAllowed;
  await withTransaction(
    pool,
    (client) => client.query(
      "INSERT INTO iam_shadow_comparisons (tenant_id, module_code, action_key, user_ref, legacy_allowed, engine_allowed, matched) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [ctx.tenantId, c.moduleCode, c.actionKey, ctx.userId, c.legacyAllowed, c.engineAllowed, matched],
    ),
    { tenantId: ctx.tenantId },
  );
  return matched;
}

/**
 * Whether a module may switch to the new engine: at least `minComparisons` comparisons in the window and no mismatch in it
 * (REQ-IAM-F13: zero unexplained mismatches before switch-over).
 */
export async function switchOverReady(pool: Pool, ctx: RequestContext, moduleCode: string, opts: { days?: number; minComparisons?: number } = {}): Promise<{ ready: boolean; comparisons: number; mismatches: number }> {
  const days = opts.days ?? 30;
  const min = opts.minComparisons ?? 100;
  const { rows } = await withTransaction(
    pool,
    (client) => client.query<{ total: string; mismatches: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE NOT matched) AS mismatches FROM iam_shadow_comparisons
        WHERE tenant_id = $1 AND module_code = $2 AND occurred_at > now() - make_interval(days => $3)`,
      [ctx.tenantId, moduleCode, days],
    ),
    { tenantId: ctx.tenantId },
  );
  const comparisons = Number(rows[0].total);
  const mismatches = Number(rows[0].mismatches);
  return { ready: comparisons >= min && mismatches === 0, comparisons, mismatches };
}
