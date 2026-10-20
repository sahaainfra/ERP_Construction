// Project and site masters, lifecycle and templates (Part 06 slice S2; REQ-ORG-F03, F04, F05, F11). Every write runs in the shared
// unit of work. Creates are pending until a second person approves them (CP-ORG-02). Each lifecycle change needs a second approver,
// and activation and closure are gated by checklists (CP-ORG-01, CP-ORG-03). A gate that cannot be met yet is passed only by a
// recorded exception with its own approver. Archived projects are read-only.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { coordinatesProblems, datesProblems, isStateCode, isUnitCode } from "./validation";
import { closureChecklist } from "./closure";
import { countLocations } from "./lbs";

export const PROJECT_TYPES = ["building", "road_highway", "bridge_flyover", "metro_rail", "water_irrigation_pipeline", "industrial_epc", "power_transmission", "real_estate_development", "interiors_fit_out", "other"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = ["proposed", "tendering", "awarded", "mobilisation", "active", "on_hold", "substantially_complete", "dlp", "closed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Allowed lifecycle moves. Assumption A-09: a lost tender moves straight from tendering to closed (no closure checklist, since
 * no work was done). Otherwise closure goes through the defect liability period (DLP).
 */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  proposed: ["tendering"],
  tendering: ["awarded", "closed"],
  awarded: ["mobilisation"],
  mobilisation: ["active"],
  active: ["on_hold", "substantially_complete"],
  on_hold: ["active"],
  substantially_complete: ["dlp"],
  dlp: ["closed"],
  closed: ["archived"],
  archived: [],
};

export const SITE_TYPES = ["main_site", "casting_yard", "batching_plant_site", "crusher_site", "labour_camp", "store_yard", "quarry_borrow_area", "office"] as const;
export const SITE_STATUSES = ["planned", "mobilising", "active", "suspended", "demobilising", "closed"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];
export const SITE_TRANSITIONS: Record<SiteStatus, readonly SiteStatus[]> = {
  planned: ["mobilising"],
  mobilising: ["active"],
  active: ["suspended", "demobilising"],
  suspended: ["active", "demobilising"],
  demobilising: ["closed"],
  closed: [],
};

const EXCEPTION_MIN = 20;

function fail(problems: string[], fieldErrors: { field: string; message: string }[] = []): never {
  throw new AppError("VALIDATION_FAILED", problems.join("; "), fieldErrors.length > 0 ? fieldErrors : problems.map((p) => ({ field: "value", message: p })));
}

/** Returns the checklist items that are not yet met for a project to become Active (CP-ORG-01). */
export async function activationChecklist(client: PoolClient, tenantId: string, projectId: number): Promise<string[]> {
  const project = await client.query<{ project_manager: string | null }>("SELECT project_manager FROM org_projects WHERE id = $1 AND tenant_id = $2", [projectId, tenantId]);
  if (project.rowCount === 0) throw new AppError("NOT_FOUND", "the project was not found");
  const missing: string[] = [];
  if (!project.rows[0].project_manager) missing.push("project manager is not assigned");
  const site = await client.query("SELECT 1 FROM org_sites WHERE project_id = $1 AND tenant_id = $2 AND approval_status = 'approved' AND status <> 'closed' AND site_manager IS NOT NULL", [projectId, tenantId]);
  if (site.rowCount === 0) missing.push("no approved site has a site manager");
  const centre = await client.query("SELECT 1 FROM org_cost_centres WHERE project_id = $1 AND tenant_id = $2 AND centre_type = 'project' AND approval_status = 'approved'", [projectId, tenantId]);
  if (centre.rowCount === 0) missing.push("no approved project cost centre");
  const fence = await client.query("SELECT 1 FROM org_site_geofences g JOIN org_sites s ON s.id = g.site_id WHERE s.project_id = $1 AND g.tenant_id = $2 AND g.approval_status = 'approved' AND g.valid_to IS NULL", [projectId, tenantId]);
  if (fence.rowCount === 0) missing.push("no approved geofence for any site");
  if ((await countLocations(client, tenantId, projectId)) === 0) missing.push("no location breakdown (LBS) for the project");
  // Not built yet: stays missing until Part 17 exists. The exception path covers the gap.
  missing.push("RACI template not built (Part 17)");
  return missing;
}

export interface ProjectInput {
  code: string;
  name: string;
  legalEntityId: number;
  branchUnitId?: number | null;
  businessUnitId?: number | null;
  projectType: ProjectType;
  contractMode?: string | null;
  templateCode?: string | null;
  clientPartyRef?: string | null;
  stateCode?: string | null;
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  jvPartnerRef?: string | null;
  reason: string;
}

async function requireApprovedUnit(client: PoolClient, tenantId: string, id: number, expected: string, field: string): Promise<void> {
  const { rows } = await client.query<{ unit_type: string; approval_status: string }>("SELECT unit_type, approval_status FROM org_units WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
  if (rows.length === 0) fail([`${field} does not exist`], [{ field, message: "not found" }]);
  if (rows[0].unit_type !== expected) fail([`${field} must be a ${expected}`], [{ field, message: `must be a ${expected}` }]);
  if (rows[0].approval_status !== "approved") fail([`${field} must be approved first`], [{ field, message: "not approved" }]);
}

/** Creates a project in pending status. A template, when given, supplies defaults once; later template edits do not change it. */
export async function createProject(pool: Pool, ctx: RequestContext, input: ProjectInput): Promise<{ id: number }> {
  const fieldErrors: { field: string; message: string }[] = [];
  if (!isUnitCode(input.code)) fieldErrors.push({ field: "code", message: "uppercase letters, digits, - and _; 2 to 20 characters" });
  if (!(PROJECT_TYPES as readonly string[]).includes(input.projectType)) fieldErrors.push({ field: "projectType", message: "not a known project type" });
  if (input.stateCode && !isStateCode(input.stateCode)) fieldErrors.push({ field: "stateCode", message: "a valid two-digit state code" });
  if (input.reason.trim().length < 10) fieldErrors.push({ field: "reason", message: "at least 10 characters" });
  for (const message of coordinatesProblems(input.latitude ?? null, input.longitude ?? null)) fieldErrors.push({ field: "latitude", message });
  if (input.plannedStart) {
    for (const message of datesProblems(input.plannedStart, input.plannedFinish ?? null)) fieldErrors.push({ field: "plannedFinish", message });
  }
  if (fieldErrors.length > 0) fail(["the project is not valid"], fieldErrors);

  return uniqueConflict(runUnitOfWork(pool, ctx, async (uow) => {
    const entity = await uow.client.query<{ approval_status: string }>("SELECT approval_status FROM org_legal_entities WHERE id = $1 AND tenant_id = $2", [input.legalEntityId, ctx.tenantId]);
    if (entity.rowCount === 0 || entity.rows[0].approval_status !== "approved") fail(["the legal entity must exist and be approved"], [{ field: "legalEntityId", message: "not approved" }]);
    if (input.branchUnitId) await requireApprovedUnit(uow.client, ctx.tenantId, input.branchUnitId, "branch", "branchUnitId");
    if (input.businessUnitId) await requireApprovedUnit(uow.client, ctx.tenantId, input.businessUnitId, "business_unit", "businessUnitId");

    let contractMode = input.contractMode ?? null;
    if (input.templateCode) {
      const template = await uow.client.query<{ project_type: string; default_contract_mode: string | null }>(
        "SELECT project_type, default_contract_mode FROM org_project_templates WHERE template_code = $1 AND tenant_id = $2",
        [input.templateCode, ctx.tenantId],
      );
      if (template.rowCount === 0) fail(["the template does not exist"], [{ field: "templateCode", message: "not found" }]);
      if (template.rows[0].project_type !== input.projectType) fail(["the template is for a different project type"], [{ field: "templateCode", message: "type mismatch" }]);
      contractMode = contractMode ?? template.rows[0].default_contract_mode;
    }

    const inserted = await uow.client.query<{ id: string }>(
      `INSERT INTO org_projects (tenant_id, code, name, legal_entity_id, branch_unit_id, business_unit_id, project_type, contract_mode, template_code,
         client_party_ref, state_code, district, latitude, longitude, planned_start, planned_finish, jv_flag, jv_partner_ref, created_by, change_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING id`,
      [
        ctx.tenantId, input.code, input.name, input.legalEntityId, input.branchUnitId ?? null, input.businessUnitId ?? null, input.projectType, contractMode,
        input.templateCode ?? null, input.clientPartyRef ?? null, input.stateCode ?? null, input.district ?? null, input.latitude ?? null, input.longitude ?? null,
        input.plannedStart ?? null, input.plannedFinish ?? null, Boolean(input.jvPartnerRef), input.jvPartnerRef || null, ctx.userId, input.reason,
      ],
    );
    const id = Number(inserted.rows[0].id);
    await uow.audit({ action: "org.project.created", entityType: "project", entityId: String(id), detail: { code: input.code, template: input.templateCode ?? null } });
    await uow.ledger({ action: "CREATED", entityType: "project", entityId: String(id), reason: input.reason });
    await uow.emit({ eventType: "org.project.created", payload: { id, code: input.code } });
    return { id };
  }));
}

/** Maps a unique-constraint violation to a conflict the caller can act on. */
async function uniqueConflict<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AppError("CONFLICT", "a record with this code already exists");
    throw error;
  }
}

export interface SiteInput {
  code: string;
  name: string;
  projectId: number;
  siteType: (typeof SITE_TYPES)[number];
  stateCode: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string;
  siteManager?: string | null;
  reason: string;
}

/** Creates a site under an approved, non-archived project. The site belongs to that project for its life. */
export async function createSite(pool: Pool, ctx: RequestContext, input: SiteInput): Promise<{ id: number }> {
  const fieldErrors: { field: string; message: string }[] = [];
  if (!isUnitCode(input.code)) fieldErrors.push({ field: "code", message: "uppercase letters, digits, - and _; 2 to 20 characters" });
  if (!(SITE_TYPES as readonly string[]).includes(input.siteType)) fieldErrors.push({ field: "siteType", message: "not a known site type" });
  if (!isStateCode(input.stateCode)) fieldErrors.push({ field: "stateCode", message: "a valid two-digit state code" });
  if (input.reason.trim().length < 10) fieldErrors.push({ field: "reason", message: "at least 10 characters" });
  for (const message of coordinatesProblems(input.latitude ?? null, input.longitude ?? null)) fieldErrors.push({ field: "latitude", message });
  if (fieldErrors.length > 0) fail(["the site is not valid"], fieldErrors);

  return uniqueConflict(runUnitOfWork(pool, ctx, async (uow) => {
    const project = await uow.client.query<{ approval_status: string; lifecycle_status: string }>("SELECT approval_status, lifecycle_status FROM org_projects WHERE id = $1 AND tenant_id = $2", [input.projectId, ctx.tenantId]);
    if (project.rowCount === 0) fail(["the project does not exist"], [{ field: "projectId", message: "not found" }]);
    if (project.rows[0].approval_status !== "approved") fail(["the project must be approved first"], [{ field: "projectId", message: "not approved" }]);
    if (project.rows[0].lifecycle_status === "archived") throw new AppError("CONFLICT", "an archived project is read-only");
    const inserted = await uow.client.query<{ id: string }>(
      `INSERT INTO org_sites (tenant_id, code, name, project_id, site_type, address, state_code, latitude, longitude, timezone, site_manager, created_by, change_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [ctx.tenantId, input.code, input.name, input.projectId, input.siteType, input.address ?? null, input.stateCode, input.latitude ?? null, input.longitude ?? null, input.timezone ?? "Asia/Kolkata", input.siteManager ?? null, ctx.userId, input.reason],
    );
    const id = Number(inserted.rows[0].id);
    await uow.audit({ action: "org.site.created", entityType: "site", entityId: String(id), detail: { code: input.code, projectId: input.projectId } });
    await uow.ledger({ action: "CREATED", entityType: "site", entityId: String(id), reason: input.reason });
    await uow.emit({ eventType: "org.site.created", payload: { id, projectId: input.projectId } });
    return { id };
  }));
}

export interface TransitionInput {
  id: number;
  to: ProjectStatus;
  reason: string;
  approvedBy: string;
  exception?: { reason: string; approvedBy: string };
}

/** Moves a project to its next lifecycle status. Needs a second approver. Gated moves need the checklist or a recorded exception. */
export async function transitionProject(pool: Pool, ctx: RequestContext, input: TransitionInput): Promise<void> {
  const problems: string[] = [];
  if (input.reason.trim().length < 10) problems.push("the reason is too short");
  if (input.approvedBy === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the person who requests a change cannot approve it");
  if (input.exception) {
    if (input.exception.reason.trim().length < EXCEPTION_MIN) problems.push("the exception reason needs at least 20 characters");
    if (input.exception.approvedBy === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the requester cannot approve their own exception");
  }
  if (problems.length > 0) fail(problems);

  await runUnitOfWork(pool, ctx, async (uow) => {
    const current = await uow.client.query<{ lifecycle_status: ProjectStatus; approval_status: string; created_by: string }>(
      "SELECT lifecycle_status, approval_status, created_by FROM org_projects WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [input.id, ctx.tenantId],
    );
    if (current.rowCount === 0) throw new AppError("NOT_FOUND", "the project was not found");
    const from = current.rows[0].lifecycle_status;
    if (from === "archived") throw new AppError("CONFLICT", "an archived project is read-only");
    if (current.rows[0].approval_status !== "approved") fail(["the project must be approved first"]);
    if (!PROJECT_TRANSITIONS[from].includes(input.to)) fail([`a project cannot move from ${from} to ${input.to}`]);

    let missing: string[] = [];
    if (input.to === "active") missing = await activationChecklist(uow.client, ctx.tenantId, input.id);
    if (from === "dlp" && input.to === "closed") {
      missing = (await closureChecklist(uow.client, ctx.tenantId, input.id)).map((item) => `closure checklist open: ${item}`);
    }
    if (missing.length > 0) {
      if (!input.exception) fail([`the gate is not met: ${missing.join("; ")}`]);
      await uow.evaluate({ cpCode: "CP-ORG-01", result: "EXCEPTION_REQUIRED", detail: { to: input.to, missing, exceptionApprovedBy: input.exception.approvedBy } });
    } else if (input.to === "active" || (from === "dlp" && input.to === "closed")) {
      await uow.evaluate({ cpCode: input.to === "active" ? "CP-ORG-01" : "CP-ORG-03", result: "PASS", detail: { to: input.to } });
    }

    await uow.client.query("UPDATE org_projects SET lifecycle_status = $2 WHERE id = $1", [input.id, input.to]);
    await uow.client.query(
      `INSERT INTO org_project_status_history (tenant_id, project_id, from_status, to_status, reason, exception_reason, changed_by, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ctx.tenantId, input.id, from, input.to, input.reason, input.exception?.reason ?? null, ctx.userId, input.approvedBy],
    );
    await uow.audit({ action: "org.project.status_changed", entityType: "project", entityId: String(input.id), detail: { from, to: input.to, exception: Boolean(input.exception) } });
    await uow.ledger({ action: "MODIFIED", entityType: "project", entityId: String(input.id), reason: input.reason });
    await uow.emit({ eventType: "org.project.status_changed", payload: { id: input.id, from, to: input.to } });
  });
}

/** Moves a site through its lifecycle. Needs a second approver. A closed site is never reopened. */
export async function transitionSite(pool: Pool, ctx: RequestContext, input: { id: number; to: SiteStatus; reason: string; approvedBy: string }): Promise<void> {
  if (input.reason.trim().length < 10) fail(["the reason is too short"]);
  if (input.approvedBy === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the person who requests a change cannot approve it");
  await runUnitOfWork(pool, ctx, async (uow) => {
    const current = await uow.client.query<{ status: SiteStatus; project_status: ProjectStatus }>(
      `SELECT s.status, p.lifecycle_status AS project_status FROM org_sites s JOIN org_projects p ON p.id = s.project_id
        WHERE s.id = $1 AND s.tenant_id = $2 FOR UPDATE OF s`,
      [input.id, ctx.tenantId],
    );
    if (current.rowCount === 0) throw new AppError("NOT_FOUND", "the site was not found");
    if (current.rows[0].project_status === "archived") throw new AppError("CONFLICT", "an archived project is read-only");
    const from = current.rows[0].status;
    if (!SITE_TRANSITIONS[from].includes(input.to)) fail([`a site cannot move from ${from} to ${input.to}`]);
    await uow.client.query("UPDATE org_sites SET status = $2 WHERE id = $1", [input.id, input.to]);
    await uow.audit({ action: "org.site.status_changed", entityType: "site", entityId: String(input.id), detail: { from, to: input.to, approvedBy: input.approvedBy } });
    await uow.ledger({ action: "MODIFIED", entityType: "site", entityId: String(input.id), reason: input.reason });
    await uow.emit({ eventType: "org.site.status_changed", payload: { id: input.id, from, to: input.to } });
  });
}

/** Reads a project and its status for the tenant. Row-level security applies. */
export async function getProject(pool: Pool, ctx: RequestContext, id: number): Promise<{ id: number; code: string; lifecycleStatus: ProjectStatus; approvalStatus: string; projectType: ProjectType; contractMode: string | null } | null> {
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ id: string; code: string; lifecycle_status: ProjectStatus; approval_status: string; project_type: ProjectType; contract_mode: string | null }>(
        "SELECT id, code, lifecycle_status, approval_status, project_type, contract_mode FROM org_projects WHERE id = $1",
        [id],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return { id: Number(r.id), code: r.code, lifecycleStatus: r.lifecycle_status, approvalStatus: r.approval_status, projectType: r.project_type, contractMode: r.contract_mode };
    },
    { tenantId: ctx.tenantId },
  );
}

/** Creates a project template. Templates are not approved; a template change never reaches an existing project. */
export async function createTemplate(pool: Pool, ctx: RequestContext, input: { code: string; name: string; projectType: ProjectType; defaultContractMode?: string | null }): Promise<{ id: number }> {
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(input.code)) fail(["the template code is not valid"], [{ field: "code", message: "lower-case letters, digits and _" }]);
  return uniqueConflict(
    withTransaction(
      pool,
      async (client) => {
        const { rows } = await client.query<{ id: string }>(
          "INSERT INTO org_project_templates (tenant_id, template_code, name, project_type, default_contract_mode, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
          [ctx.tenantId, input.code, input.name, input.projectType, input.defaultContractMode ?? null, ctx.userId],
        );
        return { id: Number(rows[0].id) };
      },
      { tenantId: ctx.tenantId },
    ),
  );
}
