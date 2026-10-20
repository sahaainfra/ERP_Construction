// Site geofences (Part 06 slice S4; REQ-ORG-F07). Versions are never edited: a new version is proposed, approved by a second
// person, and closes the previous version at its own start. A punch is checked against the version valid at the punch time.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { distanceM, pointInPolygon, polygonProblems, type Point } from "./geo";
import { coordinatesProblems } from "./validation";

export interface CircleFence {
  shape: "circle";
  centre: Point;
  radiusM: number;
}
export interface PolygonFence {
  shape: "polygon";
  ring: [number, number][];
}
export type FenceShape = CircleFence | PolygonFence;

export interface FenceProposal {
  siteId: number;
  shape: FenceShape;
  accuracyToleranceM?: number;
  validFrom: string; // ISO timestamp
  reason: string;
}

export function fenceProblems(shape: FenceShape, tolerance: number): string[] {
  const problems: string[] = [];
  if (!(tolerance >= 0 && tolerance <= 500)) problems.push("accuracy tolerance must be between 0 and 500 metres");
  if (shape.shape === "circle") {
    problems.push(...coordinatesProblems(shape.centre.latitude, shape.centre.longitude));
    if (!(shape.radiusM >= 20 && shape.radiusM <= 5000)) problems.push("radius must be between 20 and 5,000 metres");
  } else {
    problems.push(...polygonProblems(shape.ring));
  }
  return problems;
}

/** Proposes a new version for a site. Pending until a second person approves it. */
export async function proposeGeofence(pool: Pool, ctx: RequestContext, input: FenceProposal): Promise<{ id: number; versionNo: number }> {
  const problems = [...fenceProblems(input.shape, input.accuracyToleranceM ?? 20)];
  if (Number.isNaN(Date.parse(input.validFrom))) problems.push("valid-from must be a timestamp");
  if (input.reason.trim().length < 10) problems.push("the reason is too short");
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the geofence is not valid", problems.map((message) => ({ field: "geofence", message })));

  return runUnitOfWork(pool, ctx, async (uow) => {
    const site = await uow.client.query<{ status: string }>("SELECT status FROM org_sites WHERE id = $1 AND tenant_id = $2", [input.siteId, ctx.tenantId]);
    if (site.rowCount === 0) throw new AppError("NOT_FOUND", "the site was not found");
    const next = await uow.client.query<{ n: string }>("SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM org_site_geofences WHERE site_id = $1 AND tenant_id = $2", [input.siteId, ctx.tenantId]);
    const versionNo = Number(next.rows[0].n);
    const common = [ctx.tenantId, input.siteId, versionNo, input.shape.shape];
    const geometry =
      input.shape.shape === "circle"
        ? [input.shape.centre.latitude, input.shape.centre.longitude, input.shape.radiusM, null]
        : [null, null, null, JSON.stringify(input.shape.ring)];
    const inserted = await uow.client.query<{ id: string }>(
      `INSERT INTO org_site_geofences (tenant_id, site_id, version_no, shape, centre_latitude, centre_longitude, radius_m, polygon, accuracy_tolerance_m, valid_from, created_by, change_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [...common, ...geometry, input.accuracyToleranceM ?? 20, input.validFrom, ctx.userId, input.reason],
    );
    const id = Number(inserted.rows[0].id);
    await uow.audit({ action: "org.geofence.proposed", entityType: "geofence", entityId: String(id), detail: { siteId: input.siteId, versionNo } });
    await uow.ledger({ action: "CREATED", entityType: "geofence", entityId: String(id), reason: input.reason });
    return { id, versionNo };
  });
}

/** Approves a version. The previous approved version ends where this one starts. A version cannot start before the last approved one. */
export async function approveGeofence(pool: Pool, ctx: RequestContext, id: number, reason: string): Promise<void> {
  if (reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ site_id: string; valid_from: Date; created_by: string; approval_status: string }>(
      "SELECT site_id, valid_from, created_by, approval_status FROM org_site_geofences WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [id, ctx.tenantId],
    );
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the geofence was not found");
    const row = found.rows[0];
    if (row.created_by === ctx.userId) throw new AppError("MAKER_CHECKER_REQUIRED", "the creator cannot approve their own geofence");
    if (row.approval_status !== "pending") throw new AppError("CONFLICT", "the geofence has already been decided");
    const previous = await uow.client.query<{ id: string; valid_from: Date }>(
      "SELECT id, valid_from FROM org_site_geofences WHERE site_id = $1 AND tenant_id = $2 AND approval_status = 'approved' ORDER BY valid_from DESC LIMIT 1",
      [row.site_id, ctx.tenantId],
    );
    if (previous.rowCount && previous.rows[0].valid_from > row.valid_from) {
      throw new AppError("VALIDATION_FAILED", "a new version cannot start before the last approved version", [{ field: "validFrom", message: "earlier than the current version" }]);
    }
    if (previous.rowCount) {
      await uow.client.query("UPDATE org_site_geofences SET valid_to = $2 WHERE id = $1", [previous.rows[0].id, row.valid_from]);
    }
    await uow.client.query("UPDATE org_site_geofences SET approval_status = 'approved', approved_by = $2 WHERE id = $1", [id, ctx.userId]);
    await uow.audit({ action: "org.geofence.approved", entityType: "geofence", entityId: String(id), detail: { reason } });
    await uow.ledger({ action: "APPROVED", entityType: "geofence", entityId: String(id), reason });
    await uow.evaluate({ cpCode: "CP-ORG-02", result: "PASS", detail: { kind: "geofence", action: "approve" } });
    await uow.emit({ eventType: "org.site.geofence_updated", payload: { id } });
  });
}

interface FenceRow {
  id: string;
  version_no: number;
  shape: "circle" | "polygon";
  centre_latitude: string | null;
  centre_longitude: string | null;
  radius_m: number | null;
  polygon: [number, number][] | null;
  accuracy_tolerance_m: number;
}

/** The approved version that is valid at `at`, or null. */
export async function fenceAt(client: PoolClient, tenantId: string, siteId: number, at: Date): Promise<FenceRow | null> {
  const { rows } = await client.query<FenceRow>(
    `SELECT id, version_no, shape, centre_latitude, centre_longitude, radius_m, polygon, accuracy_tolerance_m
       FROM org_site_geofences
      WHERE site_id = $1 AND tenant_id = $2 AND approval_status = 'approved' AND valid_from <= $3 AND (valid_to IS NULL OR valid_to > $3)
      ORDER BY valid_from DESC LIMIT 1`,
    [siteId, tenantId, at],
  );
  return rows[0] ?? null;
}

export interface PunchCheck {
  result: "inside" | "outside" | "no_fence" | "low_accuracy";
  fenceVersion: number | null;
  distanceM: number | null;
}

/**
 * Checks a punch against the fence valid at the punch time. Inside means within the radius (or polygon) plus the accuracy
 * tolerance, so a noisy GPS fix at the edge is not refused. A fix worse than the tolerance is reported as low accuracy.
 */
export function evaluatePunch(fence: FenceRow | null, point: Point, accuracyM: number): PunchCheck {
  if (!fence) return { result: "no_fence", fenceVersion: null, distanceM: null };
  if (accuracyM > Math.max(fence.accuracy_tolerance_m, 1) * 5) return { result: "low_accuracy", fenceVersion: fence.version_no, distanceM: null };
  if (fence.shape === "polygon") {
    const inside = pointInPolygon(point, fence.polygon ?? []);
    return { result: inside ? "inside" : "outside", fenceVersion: fence.version_no, distanceM: null };
  }
  const centre = { latitude: Number(fence.centre_latitude), longitude: Number(fence.centre_longitude) };
  const distance = distanceM(point, centre);
  const limit = (fence.radius_m ?? 0) + fence.accuracy_tolerance_m;
  return { result: distance <= limit ? "inside" : "outside", fenceVersion: fence.version_no, distanceM: Math.round(distance) };
}

/** Checks a punch for a site at a moment in time. The version is the one valid at `at`. */
export async function checkPunch(pool: Pool, ctx: RequestContext, input: { siteId: number; point: Point; accuracyM: number; at: Date }): Promise<PunchCheck> {
  const fence = await withTransaction(pool, (client) => fenceAt(client, ctx.tenantId, input.siteId, input.at), { tenantId: ctx.tenantId });
  return evaluatePunch(fence, input.point, input.accuracyM);
}
