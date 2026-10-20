// Roles, role grants and scoped assignments (Part 07 REQ-IAM-F05, F06; CP-IAM-01). Every change to what a role can do, and every
// assignment of a role to a person, needs a second approver. Only approved, in-date rows take effect. The assigner must be
// able to grant the scope they assign: `iam.assignment.create` is checked against the scope (no assignment outside own scope).
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { can, permissionKnown } from "./pdp";
import { CONDITION_NAMES, SCOPE_TYPES, type ScopeType, type Resource } from "./policy";

export function permissionKeyProblem(key: string): string | null {
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(key) ? null : "a permission key has the form module.feature.action";
}

/** Adds or updates registry entries. Idempotent: each Part registers its keys at start-up. */
export async function registerPermissions(pool: Pool, keys: readonly { key: string; module: string; description: string; stage: string; sensitivity?: "standard" | "sensitive" | "privileged" }[]): Promise<void> {
  for (const k of keys) {
    const problem = permissionKeyProblem(k.key);
    if (problem) throw new AppError("VALIDATION_FAILED", problem, [{ field: "key", message: k.key }]);
    await pool.query(
      `INSERT INTO iam_permissions (permission_key, module_code, description, protocol_stage, sensitivity) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (permission_key) DO UPDATE SET module_code = EXCLUDED.module_code, description = EXCLUDED.description, protocol_stage = EXCLUDED.protocol_stage, sensitivity = EXCLUDED.sensitivity`,
      [k.key, k.module, k.description, k.stage, k.sensitivity ?? "standard"],
    );
  }
}

export async function createRole(pool: Pool, ctx: RequestContext, input: { code: string; name: string }): Promise<{ id: number }> {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(input.code)) throw new AppError("VALIDATION_FAILED", "the role code is not valid", [{ field: "code", message: "lower-case letters, digits and _" }]);
  const allowed = await can(pool, ctx, "iam.role.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  try {
    return await withTransaction(
      pool,
      async (client) => {
        const { rows } = await client.query<{ id: string }>("INSERT INTO iam_roles (tenant_id, role_code, name, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [ctx.tenantId, input.code, input.name, ctx.userId]);
        return { id: Number(rows[0].id) };
      },
      { tenantId: ctx.tenantId },
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AppError("CONFLICT", "a role with this code already exists");
    throw error;
  }
}

/** Proposes a grant of a permission to a role. Pending until a second person approves (CP-IAM-01). */
export async function proposeRoleGrant(pool: Pool, ctx: RequestContext, input: { roleId: number; permissionKey: string; effect: "allow" | "deny"; conditions?: Record<string, unknown>; reason: string }): Promise<{ id: number }> {
  const problems: string[] = [];
  if (!(await withTransaction(pool, (c) => permissionKnown(c, input.permissionKey), { tenantId: ctx.tenantId }))) problems.push("the permission is not registered");
  for (const name of Object.keys(input.conditions ?? {})) if (!(CONDITION_NAMES as readonly string[]).includes(name)) problems.push(`condition ${name} is not supported`);
  if (input.reason.trim().length < 10) problems.push("the reason is too short");
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", problems.join("; "), problems.map((message) => ({ field: "grant", message })));
  const allowed = await can(pool, ctx, "iam.role.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const { rows } = await uow.client.query<{ id: string }>(
      `INSERT INTO iam_role_permissions (tenant_id, role_id, permission_key, effect, conditions, created_by, change_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ctx.tenantId, input.roleId, input.permissionKey, input.effect, JSON.stringify(input.conditions ?? {}), ctx.userId, input.reason],
    );
    const id = Number(rows[0].id);
    await uow.audit({ action: "iam.role_grant.proposed", entityType: "role_grant", entityId: String(id), detail: { roleId: input.roleId, permissionKey: input.permissionKey, effect: input.effect } });
    await uow.ledger({ action: "CREATED", entityType: "role_grant", entityId: String(id), reason: input.reason });
    return { id };
  });
}

export async function approveRoleGrant(pool: Pool, ctx: RequestContext, id: number, reason: string): Promise<void> {
  if (reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ created_by: string; approval_status: string; permission_key: string; effect: string }>(
      "SELECT created_by, approval_status, permission_key, effect FROM iam_role_permissions WHERE id = $1 FOR UPDATE", [id]);
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the grant was not found");
    if (found.rows[0].created_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the creator cannot approve their own grant");
    if (found.rows[0].approval_status !== "pending") throw new AppError("CONFLICT", "the grant has already been decided");
    await uow.client.query("UPDATE iam_role_permissions SET approval_status = 'approved', approved_by = $2 WHERE id = $1", [id, ctx.userId]);
    await uow.audit({ action: "iam.role_grant.approved", entityType: "role_grant", entityId: String(id), detail: { permissionKey: found.rows[0].permission_key, effect: found.rows[0].effect } });
    await uow.evaluate({ cpCode: "CP-IAM-01", result: "PASS", detail: { action: "approve_role_grant" } });
    await uow.emit({ eventType: "iam.role.updated", payload: { id } });
  });
}

export interface AssignmentInput {
  userRef: string;
  roleId: number;
  scopeType: ScopeType;
  scopeId?: string | null;
  validFrom: string;
  validTo?: string | null;
  reason: string;
  /** Resource ids the scope refers to, so the assigner's own scope can be checked. */
  scopeResource?: Resource;
}

/** Proposes an assignment. The assigner must hold `iam.assignment.create` over the scope they assign. */
export async function proposeAssignment(pool: Pool, ctx: RequestContext, input: AssignmentInput): Promise<{ id: number }> {
  const problems: string[] = [];
  if (!(SCOPE_TYPES as readonly string[]).includes(input.scopeType)) problems.push("unknown scope");
  if ((input.scopeType === "tenant" || input.scopeType === "own") !== (input.scopeId === null || input.scopeId === undefined)) problems.push("a scope id is needed for this scope type and not for tenant or own");
  if (input.reason.trim().length < 10) problems.push("the reason is too short");
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", problems.join("; "), problems.map((message) => ({ field: "assignment", message })));
  const resource: Resource = { ...(input.scopeResource ?? {}), ownerUserId: input.userRef };
  const scopeField: Record<string, keyof Resource> = { company: "companyId", legal_entity: "legalEntityId", branch: "branchId", department: "departmentId", project: "projectId", site: "siteId" };
  if (input.scopeType in scopeField) (resource as Record<string, unknown>)[scopeField[input.scopeType]] = input.scopeId;
  // Always checked against a resource: a tenant-wide assignment needs a tenant-wide grant, not any grant.
  const allowed = await can(pool, ctx, "iam.assignment.create", resource);
  if (!allowed.allowed) throw new AppError("FORBIDDEN", `you cannot assign a role at this scope: ${allowed.reason}`);

  return runUnitOfWork(pool, ctx, async (uow) => {
    const { rows } = await uow.client.query<{ id: string }>(
      `INSERT INTO iam_user_role_assignments (tenant_id, user_ref, role_id, scope_type, scope_id, valid_from, valid_to, created_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [ctx.tenantId, input.userRef, input.roleId, input.scopeType, input.scopeId ?? null, input.validFrom, input.validTo ?? null, ctx.userId, input.reason],
    );
    const id = Number(rows[0].id);
    await uow.audit({ action: "iam.assignment.proposed", entityType: "assignment", entityId: String(id), detail: { userRef: input.userRef, roleId: input.roleId, scopeType: input.scopeType } });
    await uow.ledger({ action: "CREATED", entityType: "assignment", entityId: String(id), reason: input.reason });
    return { id };
  });
}

export async function approveAssignment(pool: Pool, ctx: RequestContext, id: number, reason: string): Promise<void> {
  if (reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ created_by: string; approval_status: string; user_ref: string }>("SELECT created_by, approval_status, user_ref FROM iam_user_role_assignments WHERE id = $1 FOR UPDATE", [id]);
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the assignment was not found");
    if (found.rows[0].created_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the creator cannot approve their own assignment");
    if (found.rows[0].approval_status !== "pending") throw new AppError("CONFLICT", "the assignment has already been decided");
    await uow.client.query("UPDATE iam_user_role_assignments SET approval_status = 'approved', approved_by = $2 WHERE id = $1", [id, ctx.userId]);
    await uow.audit({ action: "iam.assignment.approved", entityType: "assignment", entityId: String(id), detail: { userRef: found.rows[0].user_ref } });
    await uow.evaluate({ cpCode: "CP-IAM-01", result: "PASS", detail: { action: "approve_assignment" } });
    await uow.emit({ eventType: "iam.assignment.changed", payload: { id, userRef: found.rows[0].user_ref } });
  });
}
