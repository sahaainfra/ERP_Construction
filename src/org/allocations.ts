// Project allocations and the context switcher (Part 06 slice S4; REQ-ORG-F08, F09; CP-ORG-04). A person's allocation is a
// share of a day on a project or site. An allocation outside the project dates is refused; a day above 100 % is recorded as a
// WARN under CP-ORG-04 and the allocation is kept, so the planner can see it.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { datesProblems } from "./validation";

const MAX_DAYS_FOR_OPEN_ENDED = 366;

export interface AllocationInput {
  userRef: string;
  projectId: number;
  siteId?: number | null;
  roleOnProject: string;
  validFrom: string;
  validTo?: string | null;
  allocationPct: number;
  reason: string;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Largest total allocation (in per cent) across the days of [from, to] for one person, counting the new allocation. */
export function peakLoad(existing: readonly { from: string; to: string | null; pct: number }[], candidate: { from: string; to: string | null; pct: number }): { peak: number; day: string | null } {
  const last = candidate.to ?? addDays(candidate.from, MAX_DAYS_FOR_OPEN_ENDED);
  let peak = 0;
  let peakDay: string | null = null;
  for (let day = candidate.from; day <= last; day = addDays(day, 1)) {
    let total = candidate.pct;
    for (const e of existing) {
      if (e.from <= day && (e.to === null || e.to >= day)) total += e.pct;
    }
    if (total > peak) {
      peak = total;
      peakDay = day;
    }
  }
  return { peak, day: peakDay };
}

async function loadProject(client: PoolClient, tenantId: string, projectId: number) {
  const { rows } = await client.query<{ approval_status: string; lifecycle_status: string; planned_start: string | null; planned_finish: string | null; revised_finish: string | null }>(
    "SELECT approval_status, lifecycle_status, to_char(planned_start, 'YYYY-MM-DD') AS planned_start, to_char(planned_finish, 'YYYY-MM-DD') AS planned_finish, to_char(revised_finish, 'YYYY-MM-DD') AS revised_finish FROM org_projects WHERE id = $1 AND tenant_id = $2",
    [projectId, tenantId],
  );
  if (rows.length === 0) throw new AppError("NOT_FOUND", "the project was not found");
  if (rows[0].lifecycle_status === "archived") throw new AppError("CONFLICT", "an archived project is read-only");
  if (rows[0].approval_status !== "approved") throw new AppError("VALIDATION_FAILED", "the project must be approved first", [{ field: "projectId", message: "not approved" }]);
  return rows[0];
}

export async function createAllocation(pool: Pool, ctx: RequestContext, input: AllocationInput): Promise<{ id: number; peakPct: number; warning: boolean }> {
  const problems: { field: string; message: string }[] = [];
  if (!(input.allocationPct > 0 && input.allocationPct <= 200)) problems.push({ field: "allocationPct", message: "between 0 and 200 per cent" });
  for (const message of datesProblems(input.validFrom, input.validTo ?? null)) problems.push({ field: "validFrom", message });
  if (input.reason.trim().length < 10) problems.push({ field: "reason", message: "at least 10 characters" });
  if (!input.userRef) problems.push({ field: "userRef", message: "required" });
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the allocation is not valid", problems);

  return runUnitOfWork(pool, ctx, async (uow) => {
    const project = await loadProject(uow.client, ctx.tenantId, input.projectId);
    const end = input.validTo ?? null;
    const planEnd = project.revised_finish ?? project.planned_finish;
    if ((project.planned_start && input.validFrom < project.planned_start) || (planEnd && (end ?? input.validFrom) > planEnd)) {
      throw new AppError("VALIDATION_FAILED", "the allocation must fall within the project dates", [{ field: "validFrom", message: "outside the project dates" }]);
    }
    if (input.siteId) {
      const site = await uow.client.query("SELECT 1 FROM org_sites WHERE id = $1 AND project_id = $2 AND tenant_id = $3", [input.siteId, input.projectId, ctx.tenantId]);
      if (site.rowCount === 0) throw new AppError("VALIDATION_FAILED", "the site does not belong to the project", [{ field: "siteId", message: "not in the project" }]);
    }
    const overlapping = await uow.client.query<{ valid_from: string; valid_to: string | null; allocation_pct: string }>(
      `SELECT to_char(valid_from, 'YYYY-MM-DD') AS valid_from, to_char(valid_to, 'YYYY-MM-DD') AS valid_to, allocation_pct
         FROM org_project_allocations WHERE tenant_id = $1 AND user_ref = $2 AND valid_from <= COALESCE($4::date, DATE '9999-12-31') AND (valid_to IS NULL OR valid_to >= $3::date)`,
      [ctx.tenantId, input.userRef, input.validFrom, end],
    );
    const { peak } = peakLoad(
      overlapping.rows.map((r) => ({ from: r.valid_from, to: r.valid_to, pct: Number(r.allocation_pct) })),
      { from: input.validFrom, to: end, pct: input.allocationPct },
    );
    const inserted = await uow.client.query<{ id: string }>(
      `INSERT INTO org_project_allocations (tenant_id, user_ref, project_id, site_id, role_on_project, valid_from, valid_to, allocation_pct, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [ctx.tenantId, input.userRef, input.projectId, input.siteId ?? null, input.roleOnProject, input.validFrom, end, input.allocationPct, input.reason, ctx.userId],
    );
    const id = Number(inserted.rows[0].id);
    const warning = peak > 100;
    await uow.audit({ action: "org.allocation.created", entityType: "allocation", entityId: String(id), detail: { projectId: input.projectId, peakPct: peak } });
    await uow.ledger({ action: "CREATED", entityType: "allocation", entityId: String(id), reason: input.reason });
    if (warning) await uow.evaluate({ cpCode: "CP-ORG-04", result: "WARN", detail: { userRef: input.userRef, peakPct: peak } });
    await uow.emit({ eventType: "org.allocation.changed", payload: { id, userRef: input.userRef } });
    return { id, peakPct: peak, warning };
  });
}

/** The projects and sites a person is allocated to on a date. Used for the context switcher and for data scope (Part 07). */
export async function allocatedScopes(pool: Pool, ctx: RequestContext, userRef: string, asOf: string): Promise<{ projectId: number; projectCode: string; siteId: number | null; role: string }[]> {
  const { rows } = await withTransaction(
    pool,
    (client) =>
      client.query<{ project_id: string; project_code: string; site_id: string | null; role_on_project: string }>(
        `SELECT a.project_id, p.code AS project_code, a.site_id, a.role_on_project
           FROM org_project_allocations a JOIN org_projects p ON p.id = a.project_id
          WHERE a.tenant_id = $1 AND a.user_ref = $2 AND a.valid_from <= $3::date AND (a.valid_to IS NULL OR a.valid_to >= $3::date)
            AND p.lifecycle_status <> 'archived'
          ORDER BY p.code`,
        [ctx.tenantId, userRef, asOf],
      ),
    { tenantId: ctx.tenantId },
  );
  return rows.map((r) => ({ projectId: Number(r.project_id), projectCode: r.project_code, siteId: r.site_id === null ? null : Number(r.site_id), role: r.role_on_project }));
}

export interface UserContext {
  pinned: { projectId: number; siteId: number | null }[];
  recent: { projectId: number; siteId: number | null }[];
}

/** Reads the signed-in person's pinned and recent contexts. A person sees only their own. */
export async function getUserContext(pool: Pool, ctx: RequestContext): Promise<UserContext> {
  const { rows } = await withTransaction(
    pool,
    (client) => client.query<{ pinned: UserContext["pinned"]; recent: UserContext["recent"] }>("SELECT pinned, recent FROM org_user_contexts WHERE tenant_id = $1 AND user_ref = $2", [ctx.tenantId, ctx.userId]),
    { tenantId: ctx.tenantId },
  );
  return rows[0] ?? { pinned: [], recent: [] };
}

/**
 * Records that the person used a project or site, and optionally pins it. Only allocated scopes can be chosen: the
 * allocation is checked on the date of the choice. The list keeps the 10 most recent.
 */
export async function recordContextUse(pool: Pool, ctx: RequestContext, choice: { projectId: number; siteId: number | null; pin?: boolean; unpin?: boolean }): Promise<UserContext> {
  const today = new Date().toISOString().slice(0, 10);
  const allowed = await allocatedScopes(pool, ctx, ctx.userId, today);
  if (!allowed.some((s) => s.projectId === choice.projectId && (choice.siteId === null || s.siteId === choice.siteId))) {
    throw new AppError("FORBIDDEN", "you are not allocated to that project or site");
  }
  const current = await getUserContext(pool, ctx);
  const same = (a: { projectId: number; siteId: number | null }) => a.projectId === choice.projectId && a.siteId === choice.siteId;
  const recent = [choice, ...current.recent.filter((r) => !same(r))].slice(0, 10).map(({ projectId, siteId }) => ({ projectId, siteId }));
  let pinned = current.pinned;
  if (choice.pin) pinned = [...pinned.filter((p) => !same(p)), { projectId: choice.projectId, siteId: choice.siteId }].slice(0, 10);
  if (choice.unpin) pinned = pinned.filter((p) => !same(p));
  await withTransaction(
    pool,
    (client) =>
      client.query(
        `INSERT INTO org_user_contexts (tenant_id, user_ref, pinned, recent, updated_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (tenant_id, user_ref) DO UPDATE SET pinned = EXCLUDED.pinned, recent = EXCLUDED.recent, updated_at = now()`,
        [ctx.tenantId, ctx.userId, JSON.stringify(pinned), JSON.stringify(recent)],
      ),
    { tenantId: ctx.tenantId },
  );
  return { pinned, recent };
}
