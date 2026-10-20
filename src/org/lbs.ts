// Location breakdown structure (Part 06 slice S3; REQ-ORG-F06; Annex B11). Each project type has default location levels;
// the levels are a working assumption (A-11) until Annex B11 is confirmed. Locations hang off a project, never off a site.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";

export const LOCATION_TYPES = ["tower", "floor", "zone", "chainage_stretch", "pier", "span", "area", "unit", "system", "line", "node"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/** Default location levels per project type, in nesting order (assumption A-11). */
export const DEFAULT_LBS_LEVELS: Record<string, readonly LocationType[]> = {
  building: ["tower", "floor", "zone"],
  real_estate_development: ["tower", "floor", "unit"],
  interiors_fit_out: ["zone", "unit"],
  road_highway: ["chainage_stretch"],
  metro_rail: ["chainage_stretch"],
  water_irrigation_pipeline: ["chainage_stretch"],
  bridge_flyover: ["pier", "span"],
  industrial_epc: ["area", "unit", "system"],
  power_transmission: ["zone", "line", "node"],
  other: ["zone", "line", "node"],
};

export interface LocationInput {
  projectId: number;
  parentId?: number | null;
  code: string;
  name: string;
  locationType: LocationType;
  chainageFrom?: number | null;
  chainageTo?: number | null;
  side?: "LHS" | "RHS" | "CENTRE" | null;
  levelLabel?: string | null;
  sequenceNo?: number;
}

/**
 * Builds chainage stretches for a linear project: each stretch is `stepM` metres long, on each requested side.
 * Chainages are in metres from the project origin. Returns the rows; the caller writes them in one unit of work.
 */
export function generateChainageStretches(input: { fromM: number; toM: number; stepM: number; sides: readonly ("LHS" | "RHS" | "CENTRE")[]; codePrefix: string }): LocationInput[] {
  if (!(input.stepM > 0)) throw new RangeError("the stretch length must be positive");
  if (input.toM <= input.fromM) throw new RangeError("the end chainage must be after the start");
  const rows: LocationInput[] = [];
  let seq = 0;
  for (let start = input.fromM; start < input.toM; start += input.stepM) {
    const end = Math.min(start + input.stepM, input.toM);
    for (const side of input.sides) {
      seq += 1;
      rows.push({
        projectId: 0,
        code: `${input.codePrefix}-${Math.round(start)}-${side}`,
        name: `Chainage ${start}–${end} m ${side}`,
        locationType: "chainage_stretch",
        chainageFrom: start,
        chainageTo: end,
        side,
        sequenceNo: seq,
      });
    }
  }
  return rows;
}

async function requireOpenProject(client: PoolClient, tenantId: string, projectId: number): Promise<void> {
  const { rows } = await client.query<{ approval_status: string; lifecycle_status: string }>("SELECT approval_status, lifecycle_status FROM org_projects WHERE id = $1 AND tenant_id = $2", [projectId, tenantId]);
  if (rows.length === 0) throw new AppError("NOT_FOUND", "the project was not found");
  if (rows[0].lifecycle_status === "archived") throw new AppError("CONFLICT", "an archived project is read-only");
  if (rows[0].approval_status !== "approved") throw new AppError("VALIDATION_FAILED", "the project must be approved first", [{ field: "projectId", message: "not approved" }]);
}

function locationProblems(input: LocationInput): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  if (!/^[A-Z][A-Z0-9_.-]{0,39}$/.test(input.code)) problems.push({ field: "code", message: "upper-case letters, digits, . - and _; up to 40 characters" });
  if (!(LOCATION_TYPES as readonly string[]).includes(input.locationType)) problems.push({ field: "locationType", message: "not a known location type" });
  if (input.chainageFrom != null && input.chainageTo != null && input.chainageTo < input.chainageFrom) problems.push({ field: "chainageTo", message: "must not be before the start chainage" });
  return problems;
}

/** Adds one location. A child must belong to the same project as its parent. */
export async function addLocation(pool: Pool, ctx: RequestContext, input: LocationInput): Promise<{ id: number }> {
  const problems = locationProblems(input);
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the location is not valid", problems);
  return uniqueConflict(
    runUnitOfWork(pool, ctx, async (uow) => {
      await requireOpenProject(uow.client, ctx.tenantId, input.projectId);
      if (input.parentId) {
        const parent = await uow.client.query<{ project_id: string }>("SELECT project_id FROM org_locations WHERE id = $1 AND tenant_id = $2", [input.parentId, ctx.tenantId]);
        if (parent.rowCount === 0 || Number(parent.rows[0].project_id) !== input.projectId) {
          throw new AppError("VALIDATION_FAILED", "the parent location must belong to the same project", [{ field: "parentId", message: "different project" }]);
        }
      }
      const inserted = await uow.client.query<{ id: string }>(
        `INSERT INTO org_locations (tenant_id, project_id, parent_id, code, name, location_type, chainage_from, chainage_to, side, level_label, sequence_no, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [ctx.tenantId, input.projectId, input.parentId ?? null, input.code, input.name, input.locationType, input.chainageFrom ?? null, input.chainageTo ?? null, input.side ?? null, input.levelLabel ?? null, input.sequenceNo ?? 0, ctx.userId],
      );
      const id = Number(inserted.rows[0].id);
      await uow.audit({ action: "org.location.created", entityType: "location", entityId: String(id), detail: { projectId: input.projectId, code: input.code } });
      await uow.emit({ eventType: "org.location.changed", payload: { id, projectId: input.projectId } });
      return { id };
    }),
  );
}

/** Adds many locations in one unit of work: all of them are written, or none. */
export async function addLocations(pool: Pool, ctx: RequestContext, projectId: number, rows: readonly Omit<LocationInput, "projectId">[]): Promise<{ count: number }> {
  if (rows.length === 0) throw new AppError("VALIDATION_FAILED", "no locations to add");
  if (rows.length > 5000) throw new AppError("VALIDATION_FAILED", "at most 5,000 locations per import");
  for (const row of rows) {
    const problems = locationProblems({ ...row, projectId });
    if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "a location row is not valid", problems);
  }
  return uniqueConflict(
    runUnitOfWork(pool, ctx, async (uow) => {
      await requireOpenProject(uow.client, ctx.tenantId, projectId);
      for (const row of rows) {
        await uow.client.query(
          `INSERT INTO org_locations (tenant_id, project_id, parent_id, code, name, location_type, chainage_from, chainage_to, side, level_label, sequence_no, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [ctx.tenantId, projectId, row.parentId ?? null, row.code, row.name, row.locationType, row.chainageFrom ?? null, row.chainageTo ?? null, row.side ?? null, row.levelLabel ?? null, row.sequenceNo ?? 0, ctx.userId],
        );
      }
      await uow.audit({ action: "org.location.bulk_created", entityType: "project", entityId: String(projectId), detail: { count: rows.length } });
      await uow.emit({ eventType: "org.location.changed", payload: { projectId, count: rows.length } });
      return { count: rows.length };
    }),
  );
}

export interface LocationNode {
  id: number;
  code: string;
  name: string;
  locationType: string;
  side: string | null;
  chainageFrom: number | null;
  chainageTo: number | null;
  children: LocationNode[];
}

/** Returns the project's locations as a tree, ordered by sequence and code. */
export async function locationTree(pool: Pool, ctx: RequestContext, projectId: number): Promise<LocationNode[]> {
  const rows = await withTransaction(
    pool,
    (client) =>
      client.query<{ id: string; parent_id: string | null; code: string; name: string; location_type: string; side: string | null; chainage_from: string | null; chainage_to: string | null }>(
        "SELECT id, parent_id, code, name, location_type, side, chainage_from, chainage_to FROM org_locations WHERE project_id = $1 ORDER BY sequence_no, code",
        [projectId],
      ),
    { tenantId: ctx.tenantId },
  );
  const nodes = new Map<number, LocationNode>();
  for (const r of rows.rows) {
    nodes.set(Number(r.id), {
      id: Number(r.id),
      code: r.code,
      name: r.name,
      locationType: r.location_type,
      side: r.side,
      chainageFrom: r.chainage_from === null ? null : Number(r.chainage_from),
      chainageTo: r.chainage_to === null ? null : Number(r.chainage_to),
      children: [],
    });
  }
  const roots: LocationNode[] = [];
  for (const r of rows.rows) {
    const node = nodes.get(Number(r.id)) as LocationNode;
    if (r.parent_id === null) roots.push(node);
    else nodes.get(Number(r.parent_id))?.children.push(node);
  }
  return roots;
}

export async function countLocations(client: PoolClient, tenantId: string, projectId: number): Promise<number> {
  const { rows } = await client.query<{ n: string }>("SELECT count(*) AS n FROM org_locations WHERE project_id = $1 AND tenant_id = $2", [projectId, tenantId]);
  return Number(rows[0].n);
}

function uniqueConflict<T>(work: Promise<T>): Promise<T> {
  return work.catch((error: unknown) => {
    if ((error as { code?: string }).code === "23505") throw new AppError("CONFLICT", "a location with this code already exists in the project");
    throw error;
  });
}
