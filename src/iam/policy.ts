// Policy decision rules (Part 07 REQ-IAM-F07). Pure functions: the database loads the grants, these functions decide.
// Deny by default; an explicit deny that applies wins; otherwise an allow that covers the resource and whose conditions hold.
export const SCOPE_TYPES = ["tenant", "company", "legal_entity", "branch", "department", "project", "site", "own"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

/** The record being acted on. Fields are the ids the scope rules use, plus attributes the conditions use. */
export interface Resource {
  companyId?: string | null;
  legalEntityId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  siteId?: string | null;
  ownerUserId?: string | null;
  attributes?: Record<string, unknown>;
}

const RESOURCE_FIELD: Record<Exclude<ScopeType, "tenant" | "own">, keyof Resource> = {
  company: "companyId",
  legal_entity: "legalEntityId",
  branch: "branchId",
  department: "departmentId",
  project: "projectId",
  site: "siteId",
};

export interface Grant {
  roleCode: string;
  effect: "allow" | "deny";
  conditions: Record<string, unknown>;
  scopeType: ScopeType;
  scopeId: string | null;
}

/**
 * Whether an assignment's scope covers a resource. With no resource (a check about no particular record, such as a create or a
 * menu), only a tenant-wide grant covers: a grant at one project must never open an action on another project.
 */
export function scopeCovers(grant: Pick<Grant, "scopeType" | "scopeId">, userId: string, resource: Resource | undefined): boolean {
  if (!resource) return grant.scopeType === "tenant";
  if (grant.scopeType === "tenant") return true;
  if (grant.scopeType === "own") return resource.ownerUserId === userId;
  const field = RESOURCE_FIELD[grant.scopeType];
  const value = resource[field];
  return typeof value === "string" && value === grant.scopeId;
}

/**
 * Evaluates the conditions a grant carries. Only the conditions listed here exist; an unknown condition fails closed.
 *  - maxAmountPaise: the record's amountPaise must be at most this value (missing amount fails).
 *  - statusIn: the record's status must be one of these values.
 */
export function conditionsHold(conditions: Record<string, unknown>, resource: Resource | undefined): boolean {
  const attributes = resource?.attributes ?? {};
  for (const [name, expected] of Object.entries(conditions)) {
    if (name === "maxAmountPaise") {
      const amount = attributes.amountPaise;
      if (typeof amount !== "number" || typeof expected !== "number" || amount > expected) return false;
    } else if (name === "statusIn") {
      if (!Array.isArray(expected) || typeof attributes.status !== "string" || !expected.includes(attributes.status)) return false;
    } else {
      return false;
    }
  }
  return true;
}

export const CONDITION_NAMES = ["maxAmountPaise", "statusIn"] as const;

export interface Decision {
  allowed: boolean;
  /** True when an explicit deny applied. An elevation must never override this. */
  denied: boolean;
  reason: string;
  source: { roleCode: string; scopeType: ScopeType; scopeId: string | null } | null;
}

/** Combines the grants that apply to one permission key for one person and resource. */
export function decide(grants: readonly Grant[], userId: string, resource: Resource | undefined, key: string): Decision {
  const applicable = grants.filter((g) => scopeCovers(g, userId, resource) && conditionsHold(g.conditions, resource));
  const deny = applicable.find((g) => g.effect === "deny");
  if (deny) return { allowed: false, denied: true, reason: `${key} is explicitly denied for role ${deny.roleCode}`, source: sourceOf(deny) };
  const allow = applicable.find((g) => g.effect === "allow");
  if (allow) return { allowed: true, denied: false, reason: `allowed by role ${allow.roleCode}`, source: sourceOf(allow) };
  return { allowed: false, denied: false, reason: `no grant of ${key} covers this record`, source: null };
}

function sourceOf(g: Grant): Decision["source"] {
  return { roleCode: g.roleCode, scopeType: g.scopeType, scopeId: g.scopeId };
}

/**
 * The ids a person may list at one scope level. A tenant-wide allow means "all", minus any ids denied at that level.
 * Grants with conditions are left out: a list has no single record to test them against (conservative).
 */
export function scopeIds(grants: readonly Grant[], scopeType: "company" | "project" | "site"): { all: boolean; ids: string[]; excluded: string[] } {
  const usable = grants.filter((g) => g.effect === "allow" && Object.keys(g.conditions).length === 0);
  // A tenant-wide deny for this key removes everything at this level.
  if (grants.some((g) => g.effect === "deny" && g.scopeType === "tenant")) return { all: false, ids: [], excluded: [] };
  const excluded = [...new Set(grants.filter((g) => g.effect === "deny" && g.scopeType === scopeType && g.scopeId).map((g) => g.scopeId as string))];
  if (usable.some((g) => g.scopeType === "tenant")) return { all: true, ids: [], excluded };
  const ids = [...new Set(usable.filter((g) => g.scopeType === scopeType && g.scopeId).map((g) => g.scopeId as string))].filter((id) => !excluded.includes(id));
  return { all: false, ids, excluded };
}
