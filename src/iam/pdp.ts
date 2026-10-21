// Policy decision point (Part 07 REQ-IAM-F07; F08 data scope). The one place where access is decided. Database access is here;
// the rules are in policy.ts. A grant counts only when it is approved and its validity window holds today.
import type { Pool, PoolClient } from "pg";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { decide, scopeIds, type Decision, type Grant, type Resource, type ScopeType } from "./policy";

export async function permissionKnown(client: PoolClient | Pool, key: string): Promise<boolean> {
  const { rowCount } = await client.query("SELECT 1 FROM iam_permissions WHERE permission_key = $1", [key]);
  return (rowCount ?? 0) > 0;
}

/** The approved, in-date grants of one person for one permission key. */
export async function grantsFor(client: PoolClient | Pool, tenantId: string, userId: string, key: string): Promise<Grant[]> {
  const { rows } = await client.query<{ role_code: string; effect: "allow" | "deny"; conditions: Record<string, unknown>; scope_type: ScopeType; scope_id: string | null }>(
    `SELECT r.role_code, rp.effect, rp.conditions, a.scope_type, a.scope_id
       FROM iam_user_role_assignments a
       JOIN iam_roles r ON r.id = a.role_id AND r.status = 'active'
       JOIN iam_role_permissions rp ON rp.role_id = r.id AND rp.permission_key = $3 AND rp.approval_status = 'approved'
      WHERE a.tenant_id = $1 AND a.user_ref = $2 AND a.approval_status = 'approved'
        AND a.revoked_at IS NULL AND a.valid_from <= CURRENT_DATE AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
        AND NOT EXISTS (SELECT 1 FROM iam_revocations rv WHERE rv.tenant_id = $1 AND rv.user_ref = $2 AND rv.cleared_at IS NULL)`,
    [tenantId, userId, key],
  );
  const grants = rows.map((r) => ({ roleCode: r.role_code, effect: r.effect, conditions: r.conditions, scopeType: r.scope_type, scopeId: r.scope_id }));
  return grants;
}

/** Decides one action. Unknown permission keys are denied (fail closed). Without a resource, any grant counts (menu gating). */
export async function can(pool: Pool, ctx: RequestContext, key: string, resource?: Resource): Promise<Decision> {
  return withTransaction(
    pool,
    async (client) => {
      if (!(await permissionKnown(client, key))) return { allowed: false, denied: false, reason: `${key} is not a registered permission`, source: null };
      const grants = await grantsFor(client, ctx.tenantId, ctx.userId, key);
      return decide(grants, ctx.userId, resource, key);
    },
    { tenantId: ctx.tenantId },
  );
}

export interface DataScope {
  companies: { all: boolean; ids: string[]; excluded: string[] };
  projects: { all: boolean; ids: string[]; excluded: string[] };
  sites: { all: boolean; ids: string[]; excluded: string[] };
  ownRecordsOnly: boolean;
}

/**
 * The data a person may list for one permission key (REQ-IAM-F08). Repositories add these as filters:
 * `WHERE project_id = ANY($ids)` unless `all` is true. Row-level security still applies underneath.
 */
export async function dataScope(pool: Pool, ctx: RequestContext, key: string): Promise<DataScope> {
  return withTransaction(
    pool,
    async (client) => {
      const grants = await grantsFor(client, ctx.tenantId, ctx.userId, key);
      const usable = grants.filter((g) => g.effect === "allow");
      return {
        companies: scopeIds(grants, "company"),
        projects: scopeIds(grants, "project"),
        sites: scopeIds(grants, "site"),
        ownRecordsOnly: usable.length > 0 && usable.every((g) => g.scopeType === "own"),
      };
    },
    { tenantId: ctx.tenantId },
  );
}

/**
 * SQL for a list: `column = ANY(ids)` when the person has a limited set, nothing when they have none, and no filter for all.
 * Excluded ids are removed on top of an all-scope. Callers must use this; reading `all` alone would skip the exclusions.
 */
export function scopePredicate(scope: { all: boolean; ids: string[]; excluded: string[] }, column: string, paramIndex: number): { sql: string; params: unknown[] } {
  if (scope.all) {
    return scope.excluded.length === 0
      ? { sql: "TRUE", params: [] }
      : { sql: `${column} <> ALL($${paramIndex}::text[])`, params: [scope.excluded] };
  }
  if (scope.ids.length === 0) return { sql: "FALSE", params: [] };
  return { sql: `${column} = ANY($${paramIndex}::text[])`, params: [scope.ids] };
}
