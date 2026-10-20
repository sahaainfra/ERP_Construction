// Enterprise structure services (Part 06 REQ-ORG-F01, F02). Every write goes through the shared kernel's unit of work, so the
// audit, the ledger, the protocol evaluation and the event commit together. Maker-checker (CP-ORG-02): the person who creates or
// changes a record cannot approve it. Records are deactivated, never deleted.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { coordinatesProblems, datesProblems, gstinProblems, isPan, isStateCode, isUnitCode } from "./validation";

export const UNIT_TYPES = ["group", "company", "branch", "office", "yard", "plant_depot", "business_unit", "division", "department"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/** Allowed parent types per unit type. "root" means the unit may have no parent. */
export const ALLOWED_PARENTS: Record<UnitType, readonly (UnitType | "root")[]> = {
  group: ["root"],
  company: ["group", "root"],
  business_unit: ["company"],
  division: ["business_unit"],
  department: ["division", "business_unit", "company", "root"],
  branch: ["company"],
  office: ["company", "branch"],
  yard: ["company", "branch"],
  plant_depot: ["company", "branch"],
};

/** The tables that go through maker-checker. The name is checked against this list before it is used in SQL. */
const APPROVABLE = {
  legal_entity: "org_legal_entities",
  unit: "org_units",
  cost_centre: "org_cost_centres",
  profit_centre: "org_profit_centres",
  project: "org_projects",
  site: "org_sites",
} as const;
export type ApprovableKind = keyof typeof APPROVABLE;

const reasonProblem = (reason: string) => (reason.trim().length < 10 ? [{ field: "reason", message: "at least 10 characters" }] : []);

function fail(problems: string[], fieldErrors: { field: string; message: string }[] = []): never {
  throw new AppError("VALIDATION_FAILED", problems.join("; "), fieldErrors.length > 0 ? fieldErrors : problems.map((p) => ({ field: "value", message: p })));
}

/** Turns a unique-constraint violation (code, PAN or number already in use) into a CONFLICT the caller can act on. */
async function uniqueAsConflict<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AppError("CONFLICT", "a record with this code, PAN or number already exists");
    throw error;
  }
}

export interface LegalEntityInput {
  code: string;
  legalName: string;
  pan: string;
  tan?: string;
  cinOrLlpin?: string;
  registeredAddress: string;
  baseCurrency?: string;
  udyamStatus?: "none" | "micro" | "small" | "medium";
  reason: string;
}

export async function createLegalEntity(pool: Pool, ctx: RequestContext, input: LegalEntityInput): Promise<{ id: number }> {
  const problems: { field: string; message: string }[] = [];
  if (!isUnitCode(input.code)) problems.push({ field: "code", message: "uppercase letters, digits, - and _; 2 to 20 characters" });
  if (!isPan(input.pan)) problems.push({ field: "pan", message: "PAN format is wrong" });
  if (input.tan !== undefined && !/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(input.tan)) problems.push({ field: "tan", message: "TAN format is wrong" });
  problems.push(...reasonProblem(input.reason));
  if (problems.length > 0) fail(["the legal entity is not valid"], problems);

  return uniqueAsConflict(runUnitOfWork(pool, ctx, async (uow) => {
    const inserted = await uow.client.query<{ id: string }>(
      `INSERT INTO org_legal_entities (tenant_id, code, legal_name, pan, tan, cin_or_llpin, registered_address, base_currency, udyam_status, created_by, change_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [ctx.tenantId, input.code, input.legalName, input.pan, input.tan ?? null, input.cinOrLlpin ?? null, input.registeredAddress, input.baseCurrency ?? "INR", input.udyamStatus ?? "none", ctx.userId, input.reason],
    );
    const id = Number(inserted.rows[0].id);
    await uow.audit({ action: "org.legal_entity.created", entityType: "legal_entity", entityId: String(id), detail: { code: input.code } });
    await uow.ledger({ action: "CREATED", entityType: "legal_entity", entityId: String(id), reason: input.reason });
    await uow.emit({ eventType: "org.legal_entity.created", payload: { id, code: input.code } });
    return { id };
  }));
}

export interface RegistrationInput {
  registrationType: "GSTIN" | "TAN" | "PF" | "ESIC" | "PT" | "LWF" | "BOCW" | "LABOUR_LICENCE";
  stateCode: string;
  number: string;
  validFrom: string;
  validTo?: string | null;
  documentRef?: string | null;
}

/** Adds a registration to a legal entity. A GSTIN must carry the entity's PAN and the registration's state. */
export async function addRegistration(pool: Pool, ctx: RequestContext, legalEntityId: number, input: RegistrationInput): Promise<{ id: number }> {
  const problems: { field: string; message: string }[] = [];
  if (!isStateCode(input.stateCode)) problems.push({ field: "stateCode", message: "a valid two-digit state code" });
  problems.push(...datesProblems(input.validFrom, input.validTo ?? null).map((message) => ({ field: "validFrom", message })));
  if (input.registrationType === "GSTIN") {
    const entity = await withTransaction(pool, (c) => c.query<{ pan: string }>("SELECT pan FROM org_legal_entities WHERE id = $1", [legalEntityId]), { tenantId: ctx.tenantId });
    if (entity.rowCount === 0) throw new AppError("NOT_FOUND", "the legal entity was not found");
    for (const message of gstinProblems(input.number, { pan: entity.rows[0].pan, stateCode: input.stateCode })) problems.push({ field: "number", message });
  }
  if (problems.length > 0) fail(["the registration is not valid"], problems);

  return uniqueAsConflict(runUnitOfWork(pool, ctx, async (uow) => {
    const inserted = await uow.client.query<{ id: string }>(
      `INSERT INTO org_legal_entity_registrations (tenant_id, legal_entity_id, registration_type, state_code, number, valid_from, valid_to, document_ref, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [ctx.tenantId, legalEntityId, input.registrationType, input.stateCode, input.number, input.validFrom, input.validTo ?? null, input.documentRef ?? null, ctx.userId],
    );
    const id = Number(inserted.rows[0].id);
    await uow.audit({ action: "org.registration.added", entityType: "legal_entity", entityId: String(legalEntityId), detail: { type: input.registrationType, stateCode: input.stateCode } });
    return { id };
  }));
}

/** Approves a pending record. The approver must be someone other than the creator (CP-ORG-02). */
export async function approveRecord(pool: Pool, ctx: RequestContext, kind: ApprovableKind, id: number, reason: string): Promise<void> {
  if (reason.trim().length < 10) fail(["the reason is too short"], reasonProblem(reason));
  const table = APPROVABLE[kind];
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ created_by: string; approval_status: string }>(`SELECT created_by, approval_status FROM ${table} WHERE id = $1`, [id]);
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the record was not found");
    if (found.rows[0].created_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the creator cannot approve their own record");
    if (found.rows[0].approval_status !== "pending") throw new AppError("CONFLICT", "the record has already been decided");
    await uow.client.query(`UPDATE ${table} SET approval_status = 'approved', approved_by = $2 WHERE id = $1`, [id, ctx.userId]);
    await uow.audit({ action: `org.${kind}.approved`, entityType: kind, entityId: String(id), detail: { reason } });
    await uow.ledger({ action: "APPROVED", entityType: kind, entityId: String(id), reason });
    await uow.evaluate({ cpCode: "CP-ORG-02", result: "PASS", detail: { kind, action: "approve" } });
    await uow.emit({ eventType: `org.${kind}.approved`, payload: { id } });
  });
}

export interface UnitInput {
  unitType: UnitType;
  code: string;
  name: string;
  parentId?: number | null;
  legalEntityId?: number | null;
  stateCode?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  headName?: string | null;
  reason: string;
}

/** Looks up the type and approval of a parent. Returns null for a unit with no parent. */
async function parentOf(client: PoolClient, tenantId: string, parentId: number | null | undefined): Promise<{ unit_type: UnitType; approval_status: string } | null> {
  if (parentId === null || parentId === undefined) return null;
  const { rows } = await client.query<{ unit_type: UnitType; approval_status: string }>("SELECT unit_type, approval_status FROM org_units WHERE id = $1 AND tenant_id = $2", [parentId, tenantId]);
  if (rows.length === 0) throw new AppError("VALIDATION_FAILED", "the parent unit does not exist", [{ field: "parentId", message: "not found" }]);
  return rows[0];
}

function parentProblems(unitType: UnitType, parent: { unit_type: UnitType; approval_status: string } | null): string[] {
  const allowed = ALLOWED_PARENTS[unitType];
  const problems: string[] = [];
  if (parent === null) {
    if (!allowed.includes("root")) problems.push(`a ${unitType} must sit under a ${allowed.filter((t) => t !== "root").join(" or ")}`);
    return problems;
  }
  if (!allowed.includes(parent.unit_type)) problems.push(`a ${unitType} cannot sit under a ${parent.unit_type}`);
  if (parent.approval_status !== "approved") problems.push("the parent unit must be approved first");
  return problems;
}

/** Creates a unit in pending status. It is usable only after a second person approves it. */
export async function createUnit(pool: Pool, ctx: RequestContext, input: UnitInput): Promise<{ id: number }> {
  const problems: string[] = [];
  const fieldErrors: { field: string; message: string }[] = [];
  if (!isUnitCode(input.code)) fieldErrors.push({ field: "code", message: "uppercase letters, digits, - and _; 2 to 20 characters" });
  if (input.stateCode && !isStateCode(input.stateCode)) fieldErrors.push({ field: "stateCode", message: "a valid two-digit state code" });
  problems.push(...coordinatesProblems(input.latitude ?? null, input.longitude ?? null));
  if (input.reason.trim().length < 10) fieldErrors.push({ field: "reason", message: "at least 10 characters" });
  if ((input.unitType === "company" || input.unitType === "branch") && !input.legalEntityId) fieldErrors.push({ field: "legalEntityId", message: "required for a company or a branch" });

  return uniqueAsConflict(runUnitOfWork(pool, ctx, async (uow) => {
    const parent = await parentOf(uow.client, ctx.tenantId, input.parentId);
    problems.push(...parentProblems(input.unitType, parent));
    if (problems.length > 0 || fieldErrors.length > 0) fail(problems.length > 0 ? problems : ["the unit is not valid"], fieldErrors);
    const inserted = await uow.client.query<{ id: string }>(
      `INSERT INTO org_units (tenant_id, unit_type, code, name, parent_id, legal_entity_id, state_code, address, latitude, longitude, head_name, created_by, change_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [ctx.tenantId, input.unitType, input.code, input.name, input.parentId ?? null, input.legalEntityId ?? null, input.stateCode ?? null, input.address ?? null, input.latitude ?? null, input.longitude ?? null, input.headName ?? null, ctx.userId, input.reason],
    );
    const id = Number(inserted.rows[0].id);
    await uow.audit({ action: "org.unit.created", entityType: "unit", entityId: String(id), detail: { unitType: input.unitType, code: input.code } });
    await uow.ledger({ action: "CREATED", entityType: "unit", entityId: String(id), reason: input.reason });
    await uow.emit({ eventType: "org.unit.created", payload: { id, unitType: input.unitType } });
    return { id };
  }));
}

/** Moves a unit under a new parent from an effective date. Refuses cycles and disallowed parents. Needs a second approver. */
export async function reparentUnit(
  pool: Pool,
  ctx: RequestContext,
  change: { unitId: number; newParentId: number | null; effectiveFrom: string; reason: string; approvedBy: string },
): Promise<void> {
  const problems = [...datesProblems(change.effectiveFrom, null).map((m) => m), ...reasonProblem(change.reason).map((p) => p.message)];
  if (change.approvedBy === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the person who requests a change cannot approve it");
  if (problems.length > 0) fail(problems);

  await runUnitOfWork(pool, ctx, async (uow) => {
    const current = await uow.client.query<{ unit_type: UnitType; parent_id: string | null }>("SELECT unit_type, parent_id FROM org_units WHERE id = $1", [change.unitId]);
    if (current.rowCount === 0) throw new AppError("NOT_FOUND", "the unit was not found");
    const unitType = current.rows[0].unit_type;
    const oldParent = current.rows[0].parent_id === null ? null : Number(current.rows[0].parent_id);
    if (change.newParentId !== null) {
      if (change.newParentId === change.unitId) fail(["a unit cannot be its own parent"]);
      const cycle = await uow.client.query(
        `WITH RECURSIVE ancestors AS (
           SELECT id, parent_id FROM org_units WHERE id = $1 AND tenant_id = $3
           UNION ALL
           SELECT u.id, u.parent_id FROM org_units u JOIN ancestors a ON u.id = a.parent_id WHERE u.tenant_id = $3
         ) SELECT 1 FROM ancestors WHERE id = $2`,
        [change.newParentId, change.unitId, ctx.tenantId],
      );
      if (cycle.rowCount && cycle.rowCount > 0) fail(["the new parent sits under this unit, which would create a cycle"]);
    }
    const parent = await parentOf(uow.client, ctx.tenantId, change.newParentId);
    const problemsWithParent = parentProblems(unitType, parent);
    if (problemsWithParent.length > 0) fail(problemsWithParent);

    await uow.client.query("UPDATE org_units SET parent_id = $2 WHERE id = $1", [change.unitId, change.newParentId]);
    await uow.client.query(
      `INSERT INTO org_unit_history (tenant_id, unit_id, change_kind, old_parent_id, new_parent_id, effective_from, reason, changed_by, approved_by)
       VALUES ($1, $2, 'reparented', $3, $4, $5, $6, $7, $8)`,
      [ctx.tenantId, change.unitId, oldParent, change.newParentId, change.effectiveFrom, change.reason, ctx.userId, change.approvedBy],
    );
    await uow.audit({ action: "org.unit.reparented", entityType: "unit", entityId: String(change.unitId), detail: { from: oldParent, to: change.newParentId } });
    await uow.ledger({ action: "MODIFIED", entityType: "unit", entityId: String(change.unitId), reason: change.reason });
    await uow.evaluate({ cpCode: "CP-ORG-02", result: "PASS", detail: { action: "reparent" } });
    await uow.emit({ eventType: "org.unit.reparented", payload: { id: change.unitId, parentId: change.newParentId } });
  });
}

/** Deactivates a unit. Refused while it has active children. Needs a second approver. Transaction use is checked by a hook (see DEV_GUIDE). */
export async function deactivateUnit(pool: Pool, ctx: RequestContext, change: { unitId: number; effectiveFrom: string; reason: string; approvedBy: string }): Promise<void> {
  const problems = [...datesProblems(change.effectiveFrom, null).map((m) => m), ...reasonProblem(change.reason).map((p) => p.message)];
  if (change.approvedBy === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the person who requests a change cannot approve it");
  if (problems.length > 0) fail(problems);

  await runUnitOfWork(pool, ctx, async (uow) => {
    const exists = await uow.client.query("SELECT 1 FROM org_units WHERE id = $1", [change.unitId]);
    if (exists.rowCount === 0) throw new AppError("NOT_FOUND", "the unit was not found");
    const children = await uow.client.query("SELECT 1 FROM org_units WHERE parent_id = $1 AND status = 'active'", [change.unitId]);
    if (children.rowCount && children.rowCount > 0) fail(["the unit has active child units; move or deactivate them first"]);
    await uow.client.query("UPDATE org_units SET status = 'inactive' WHERE id = $1", [change.unitId]);
    await uow.client.query(
      `INSERT INTO org_unit_history (tenant_id, unit_id, change_kind, effective_from, reason, changed_by, approved_by)
       VALUES ($1, $2, 'deactivated', $3, $4, $5, $6)`,
      [ctx.tenantId, change.unitId, change.effectiveFrom, change.reason, ctx.userId, change.approvedBy],
    );
    await uow.audit({ action: "org.unit.deactivated", entityType: "unit", entityId: String(change.unitId), detail: {} });
    await uow.ledger({ action: "CLOSED", entityType: "unit", entityId: String(change.unitId), reason: change.reason });
    await uow.evaluate({ cpCode: "CP-ORG-02", result: "PASS", detail: { action: "deactivate" } });
    await uow.emit({ eventType: "org.unit.deactivated", payload: { id: change.unitId } });
  });
}

export interface CentreInput {
  code: string;
  name: string;
  validFrom: string;
  validTo?: string | null;
  reason: string;
  centreType?: "project" | "overhead" | "plant" | "production_unit" | "department";
  parentId?: number | null;
  unitId?: number | null;
}

/** Creates a cost centre (with a type) or a profit centre (without one), pending approval. */
export async function createCentre(pool: Pool, ctx: RequestContext, kind: "cost_centre" | "profit_centre", input: CentreInput): Promise<{ id: number }> {
  const problems: { field: string; message: string }[] = [];
  if (!isUnitCode(input.code)) problems.push({ field: "code", message: "uppercase letters, digits, - and _; 2 to 20 characters" });
  if (kind === "cost_centre" && !input.centreType) problems.push({ field: "centreType", message: "required for a cost centre" });
  problems.push(...datesProblems(input.validFrom, input.validTo ?? null).map((message) => ({ field: "validFrom", message })));
  problems.push(...reasonProblem(input.reason));
  if (problems.length > 0) fail(["the centre is not valid"], problems);

  return uniqueAsConflict(runUnitOfWork(pool, ctx, async (uow) => {
    if (input.unitId) {
      const unit = await uow.client.query<{ approval_status: string }>("SELECT approval_status FROM org_units WHERE id = $1 AND tenant_id = $2", [input.unitId, ctx.tenantId]);
      if (unit.rowCount === 0) throw new AppError("VALIDATION_FAILED", "the unit does not exist", [{ field: "unitId", message: "not found" }]);
      if (unit.rows[0].approval_status !== "approved") throw new AppError("VALIDATION_FAILED", "the unit must be approved first", [{ field: "unitId", message: "not approved" }]);
    }
    const inserted =
      kind === "cost_centre"
        ? await uow.client.query<{ id: string }>(
            `INSERT INTO org_cost_centres (tenant_id, code, name, centre_type, parent_id, unit_id, valid_from, valid_to, created_by, change_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [ctx.tenantId, input.code, input.name, input.centreType, input.parentId ?? null, input.unitId ?? null, input.validFrom, input.validTo ?? null, ctx.userId, input.reason],
          )
        : await uow.client.query<{ id: string }>(
            `INSERT INTO org_profit_centres (tenant_id, code, name, parent_id, unit_id, valid_from, valid_to, created_by, change_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [ctx.tenantId, input.code, input.name, input.parentId ?? null, input.unitId ?? null, input.validFrom, input.validTo ?? null, ctx.userId, input.reason],
          );
    const id = Number(inserted.rows[0].id);
    await uow.audit({ action: `org.${kind}.created`, entityType: kind, entityId: String(id), detail: { code: input.code } });
    await uow.ledger({ action: "CREATED", entityType: kind, entityId: String(id), reason: input.reason });
    await uow.emit({ eventType: `org.${kind}.created`, payload: { id } });
    return { id };
  }));
}

/** Reads a unit for the tenant. Row-level security applies. */
export async function getUnit(pool: Pool, ctx: RequestContext, id: number): Promise<{ id: number; unitType: UnitType; code: string; parentId: number | null; status: string; approvalStatus: string } | null> {
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ id: string; unit_type: UnitType; code: string; parent_id: string | null; status: string; approval_status: string }>(
        "SELECT id, unit_type, code, parent_id, status, approval_status FROM org_units WHERE id = $1",
        [id],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return { id: Number(r.id), unitType: r.unit_type, code: r.code, parentId: r.parent_id === null ? null : Number(r.parent_id), status: r.status, approvalStatus: r.approval_status };
    },
    { tenantId: ctx.tenantId },
  );
}
