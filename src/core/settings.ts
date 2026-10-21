// Configuration hierarchy (Part 05 REQ-CORE-F07; CP-CORE-03). Values are append-only versions; the effective value is resolved
// from the most specific scope that holds a value, and business-impacting keys need a second approver.
import type { Pool } from "pg";
import { AppError } from "./errors";
import { runUnitOfWork } from "./uow";
import { withTransaction } from "../db/transactions";
import type { RequestContext } from "./context";

export const SCOPE_ORDER = ["user", "site", "project", "branch", "legal_entity", "company", "tenant"] as const;
export type ScopeType = (typeof SCOPE_ORDER)[number];

export interface SettingDefinition {
  key: string;
  type: "int" | "string" | "bool";
  default: number | string | boolean;
  min?: number;
  max?: number;
  allowed?: readonly string[];
  /** Business-impacting keys change only with a second approver (maker-checker). */
  businessImpacting: boolean;
}

export const SETTINGS_REGISTRY: Record<string, SettingDefinition> = {
  "core.fiscal.start_month": { key: "core.fiscal.start_month", type: "int", default: 4, min: 1, max: 12, businessImpacting: true },
  "core.locale.default": { key: "core.locale.default", type: "string", default: "en-IN", allowed: ["en-IN", "hi-IN"], businessImpacting: false },
  "core.notifications.quiet_hours": { key: "core.notifications.quiet_hours", type: "bool", default: false, businessImpacting: false },
};

export function validateSettingValue(def: SettingDefinition, value: unknown): void {
  const bad = (msg: string) => new AppError("VALIDATION_FAILED", msg, [{ field: def.key, message: msg }]);
  if (def.type === "int") {
    if (typeof value !== "number" || !Number.isInteger(value)) throw bad("must be a whole number");
    if (def.min !== undefined && value < def.min) throw bad(`must be at least ${def.min}`);
    if (def.max !== undefined && value > def.max) throw bad(`must be at most ${def.max}`);
  } else if (def.type === "string") {
    if (typeof value !== "string") throw bad("must be text");
    if (def.allowed && !def.allowed.includes(value)) throw bad(`must be one of ${def.allowed.join(", ")}`);
  } else if (typeof value !== "boolean") {
    throw bad("must be true or false");
  }
}

/** Resolves the effective value for the scopes in the context, most specific first. Falls back to the registry default. */
export async function resolveSetting(pool: Pool, ctx: RequestContext, key: string, scopes: { type: ScopeType; id: string }[], at: Date = new Date()): Promise<{ value: unknown; source: string }> {
  const def = SETTINGS_REGISTRY[key];
  if (!def) throw new AppError("VALIDATION_FAILED", `unknown setting ${key}`);
  for (const scope of [...scopes].sort((a, b) => SCOPE_ORDER.indexOf(a.type) - SCOPE_ORDER.indexOf(b.type))) {
    const { rows } = await withTransaction(
      pool,
      (client) =>
        client.query<{ value_json: unknown }>(
          `SELECT value_json FROM core_settings
            WHERE tenant_id = $1 AND setting_key = $2 AND scope_type = $3 AND scope_id = $4 AND valid_from <= $5
            ORDER BY valid_from DESC, id DESC LIMIT 1`,
          [ctx.tenantId, key, scope.type, scope.id, at],
        ),
      { tenantId: ctx.tenantId },
    );
    if (rows.length > 0) return { value: rows[0].value_json, source: `${scope.type}:${scope.id}` };
  }
  return { value: def.default, source: "default" };
}

/** Records a new version. A business-impacting change needs an approver other than the requester. */
export async function setSetting(
  pool: Pool,
  ctx: RequestContext,
  change: { key: string; scopeType: ScopeType; scopeId: string; value: unknown; reason: string; approvedBy?: string },
): Promise<void> {
  const def = SETTINGS_REGISTRY[change.key];
  if (!def) throw new AppError("VALIDATION_FAILED", `unknown setting ${change.key}`);
  validateSettingValue(def, change.value);
  if (change.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "reason too short", [{ field: "reason", message: "at least 10 characters" }]);
  if (def.businessImpacting && (!change.approvedBy || change.approvedBy === ctx.userId)) {
    throw new AppError("MAKER_CHECKER_REQUIRED", `${change.key} is business-impacting and needs an approver other than the requester`);
  }
  await runUnitOfWork(pool, ctx, async (uow) => {
    await uow.client.query(
      `INSERT INTO core_settings (tenant_id, scope_type, scope_id, setting_key, value_json, changed_by, change_reason, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ctx.tenantId, change.scopeType, change.scopeId, change.key, JSON.stringify(change.value), ctx.userId, change.reason, change.approvedBy ?? null],
    );
    await uow.audit({ action: "setting.changed", entityType: "setting", entityId: `${change.key}@${change.scopeType}:${change.scopeId}`, detail: { approvedBy: change.approvedBy ?? null } });
    await uow.emit({ eventType: "core.setting.changed", payload: { key: change.key, scopeType: change.scopeType, scopeId: change.scopeId } });
  });
}
