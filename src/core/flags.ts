// Runtime feature-flag evaluation (Part 05 REQ-CORE-F08). Pure and shared by server and client. The registry is the Part 04 file.
import { createHash } from "node:crypto";

export interface FlagDefinition {
  key: string;
  owner: string;
  module_code: string;
  defaults_by_env: Partial<Record<"development" | "test" | "staging" | "production", boolean>>;
  kill_switch: boolean;
  targeting?: {
    tenants?: string[];
    companies?: string[];
    projects?: string[];
    roles?: string[];
    users?: string[];
    /** Percentage of users (0–100) who see the feature, bucketed deterministically by user id and key. */
    percentage?: number;
  };
  /** Set by an operator to switch the flag off for everyone at once. */
  killed?: boolean;
}

export interface EvaluationContext {
  tenantId: string;
  companyId: string;
  projectIds: string[];
  roles: string[];
  userId: string;
}

export type FlagEnvironment = "development" | "test" | "staging" | "production";

/** Stable bucket 0–99 for a user and a flag. The same user gets the same bucket for the same flag. */
export function bucket(key: string, userId: string): number {
  const digest = createHash("sha256").update(`${key}|${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export function isEnabled(flag: FlagDefinition | undefined, env: FlagEnvironment, ctx: EvaluationContext): boolean {
  if (!flag) return false;
  if (flag.killed) return false;
  const base = flag.defaults_by_env[env] ?? false;
  const t = flag.targeting;
  if (!t) return base;
  const matches =
    (t.tenants?.includes(ctx.tenantId) ?? false) ||
    (t.companies?.includes(ctx.companyId) ?? false) ||
    (t.projects?.some((p) => ctx.projectIds.includes(p)) ?? false) ||
    (t.roles?.some((r) => ctx.roles.includes(r)) ?? false) ||
    (t.users?.includes(ctx.userId) ?? false) ||
    (t.percentage !== undefined && bucket(flag.key, ctx.userId) < t.percentage);
  if (matches) return true;
  return base;
}
