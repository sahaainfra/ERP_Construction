// LBS, geofence, allocation, context and closure acceptance tests (Part 06 S3–S5). Run against the test database.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { approveRecord, createLegalEntity } from "./structure";
import { createProject, createSite, transitionProject } from "./projects";
import { addLocation, addLocations, generateChainageStretches, locationTree } from "./lbs";
import { approveGeofence, checkPunch, proposeGeofence } from "./geofence";
import { allocatedScopes, createAllocation, getUserContext, recordContextUse } from "./allocations";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const REASON = "Master data for the road project";

function contextFor(tenantId: string, userId = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: ["super_admin"], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

async function expectRefused(work: Promise<unknown>, code: string, text?: string): Promise<void> {
  const error = await work.then(
    () => null,
    (e: { code?: string; reason?: string; fieldErrors?: unknown }) => e,
  );
  expect(error, "expected the write to be refused").not.toBeNull();
  expect(error).toMatchObject({ code });
  if (text) expect(`${(error as { reason?: string }).reason} ${JSON.stringify((error as { fieldErrors?: unknown }).fieldErrors)}`).toContain(text);
}

describe.skipIf(!TEST_URL || !APP_URL)("LBS, geofences, allocations, closure (Part 06 S3–S5)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-opstest" });
    app = createPool(APP_URL!, { application_name: "erp-opstest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** An approved road project with an approved site, and the makers and checkers used by the tests. */
  async function roadProject(tenant: string) {
    const maker = contextFor(tenant);
    const checker = contextFor(tenant);
    const entity = await createLegalEntity(app, maker, { code: "MAIN", legalName: "Saha Constructions Pvt Ltd", pan: "AAPFU0939F", registeredAddress: "12 Industrial Road, Pune", reason: REASON });
    await approveRecord(app, checker, "legal_entity", entity.id, "Checked against the incorporation papers");
    const { id: projectId } = await createProject(app, maker, {
      code: "RR-1", name: "Ring road", legalEntityId: entity.id, projectType: "road_highway", reason: REASON, plannedStart: "2025-01-01", plannedFinish: "2030-12-31",
    });
    await approveRecord(app, checker, "project", projectId, "Checked against the award letter");
    const { id: siteId } = await createSite(app, maker, { code: "S-1", name: "Chainage 0 camp", projectId, siteType: "main_site", stateCode: "27", reason: REASON, siteManager: "Site manager A" });
    await approveRecord(app, checker, "site", siteId, "Checked against the site plan");
    return { maker, checker, projectId, siteId, entityId: entity.id };
  }

  describe("location breakdown (REQ-ORG-F06)", () => {
    it("writes chainage stretches as a tree, and refuses a child under another project's parent", async () => {
      const tenant = randomUUID();
      const p = await roadProject(tenant);
      const rows = generateChainageStretches({ fromM: 0, toM: 500, stepM: 250, sides: ["LHS", "RHS"], codePrefix: "CH" });
      const result = await addLocations(app, p.maker, p.projectId, rows);
      expect(result.count).toBe(4);
      const tree = await locationTree(app, p.maker, p.projectId);
      expect(tree).toHaveLength(4);
      await expectRefused(addLocation(app, p.maker, { projectId: p.projectId, code: "X-1", name: "Bad chainage", locationType: "node", chainageFrom: 100, chainageTo: 50 }), "VALIDATION_FAILED", "chainage");
    });

    it("writes all rows or none: a duplicate code in a batch leaves nothing behind", async () => {
      const tenant = randomUUID();
      const p = await roadProject(tenant);
      const batch = [
        { code: "DUP-1", name: "First", locationType: "zone" as const },
        { code: "DUP-1", name: "Second", locationType: "zone" as const },
      ];
      await expectRefused(addLocations(app, p.maker, p.projectId, batch), "CONFLICT");
      expect(await locationTree(app, p.maker, p.projectId)).toEqual([]);
    });
  });

  describe("geofences (REQ-ORG-F07; CP-ORG-02)", () => {
    it("needs a second approver, and a punch is checked against the version valid at the punch time", async () => {
      const tenant = randomUUID();
      const p = await roadProject(tenant);
      const v1 = await proposeGeofence(app, p.maker, { siteId: p.siteId, shape: { shape: "circle", centre: { latitude: 18.5, longitude: 73.8 }, radiusM: 100 }, validFrom: "2026-01-01T00:00:00Z", reason: "Initial fence from the site survey" });
      await expectRefused(approveGeofence(app, p.maker, v1.id, "Approving my own fence"), "MAKER_CHECKER_REQUIRED");
      await approveGeofence(app, p.checker, v1.id, "Checked against the survey drawing");

      const inside = await checkPunch(app, p.maker, { siteId: p.siteId, point: { latitude: 18.5, longitude: 73.8 }, accuracyM: 10, at: new Date("2026-06-01T00:00:00Z") });
      expect(inside).toMatchObject({ result: "inside", fenceVersion: 1 });

      const v2 = await proposeGeofence(app, p.maker, { siteId: p.siteId, shape: { shape: "circle", centre: { latitude: 18.5, longitude: 73.8 }, radiusM: 400 }, validFrom: "2026-09-01T00:00:00Z", reason: "Site extended to the east" });
      await approveGeofence(app, p.checker, v2.id, "Checked against the revised plan");

      const before = await checkPunch(app, p.maker, { siteId: p.siteId, point: { latitude: 18.5, longitude: 73.8 + 0.0015 }, accuracyM: 10, at: new Date("2026-08-01T00:00:00Z") });
      const after = await checkPunch(app, p.maker, { siteId: p.siteId, point: { latitude: 18.5, longitude: 73.8 + 0.0015 }, accuracyM: 10, at: new Date("2026-10-01T00:00:00Z") });
      expect(before).toMatchObject({ result: "outside", fenceVersion: 1 });
      expect(after).toMatchObject({ result: "inside", fenceVersion: 2 });
    });

    it("refuses a new version that starts before the last approved one", async () => {
      const tenant = randomUUID();
      const p = await roadProject(tenant);
      const v1 = await proposeGeofence(app, p.maker, { siteId: p.siteId, shape: { shape: "circle", centre: { latitude: 18.5, longitude: 73.8 }, radiusM: 100 }, validFrom: "2026-06-01T00:00:00Z", reason: "Fence from June" });
      await approveGeofence(app, p.checker, v1.id, "Checked against the survey drawing");
      const early = await proposeGeofence(app, p.maker, { siteId: p.siteId, shape: { shape: "circle", centre: { latitude: 18.5, longitude: 73.8 }, radiusM: 100 }, validFrom: "2026-01-01T00:00:00Z", reason: "Backdated fence attempt" });
      await expectRefused(approveGeofence(app, p.checker, early.id, "Approving the backdated version"), "VALIDATION_FAILED", "cannot start before");
    });
  });

  describe("allocations and context (REQ-ORG-F08, F09; CP-ORG-04)", () => {
    it("refuses an allocation outside the project dates, and records a WARN above 100 % in one day", async () => {
      const tenant = randomUUID();
      const p = await roadProject(tenant);
      const user = randomUUID();
      await expectRefused(createAllocation(app, p.maker, { userRef: user, projectId: p.projectId, roleOnProject: "Site engineer", validFrom: "2024-01-01", validTo: "2024-06-30", allocationPct: 50, reason: REASON }), "VALIDATION_FAILED", "project dates");
      const first = await createAllocation(app, p.maker, { userRef: user, projectId: p.projectId, roleOnProject: "Site engineer", validFrom: "2026-01-01", validTo: "2026-12-31", allocationPct: 60, reason: REASON });
      expect(first.warning).toBe(false);
      const second = await createAllocation(app, p.maker, { userRef: user, projectId: p.projectId, roleOnProject: "Planner", validFrom: "2026-06-01", validTo: "2026-08-31", allocationPct: 60, reason: REASON });
      expect(second).toMatchObject({ peakPct: 120, warning: true });
      const warns = await withTransaction(app, (c) => c.query("SELECT 1 FROM core_protocol_evaluations WHERE cp_code = 'CP-ORG-04' AND result = 'WARN'"), { tenantId: tenant });
      expect(warns.rowCount).toBe(1);
    });

    it("lets a person pick only allocated scopes, and keeps pinned and recent choices per person", async () => {
      const tenant = randomUUID();
      const p = await roadProject(tenant);
      const today = new Date().toISOString().slice(0, 10);
      const me = contextFor(tenant);
      await createAllocation(app, p.maker, { userRef: me.userId, projectId: p.projectId, siteId: p.siteId, roleOnProject: "Site engineer", validFrom: "2025-01-01", validTo: "2030-12-31", allocationPct: 100, reason: REASON });
      expect((await allocatedScopes(app, me, me.userId, today))).toHaveLength(1);
      await expectRefused(recordContextUse(app, contextFor(tenant), { projectId: p.projectId, siteId: null }), "FORBIDDEN");
      const context = await recordContextUse(app, me, { projectId: p.projectId, siteId: p.siteId, pin: true });
      expect(context.pinned).toEqual([{ projectId: p.projectId, siteId: p.siteId }]);
      expect((await getUserContext(app, me)).recent).toHaveLength(1);
      expect((await getUserContext(app, contextFor(tenant))).pinned).toEqual([]);
    });
  });

  describe("activation and closure gates with real checks (CP-ORG-01, CP-ORG-03)", () => {
    it("drops geofence and LBS from the activation gaps once they exist, and keeps RACI open", async () => {
      const tenant = randomUUID();
      const p = await roadProject(tenant);
      await proposeGeofence(app, p.maker, { siteId: p.siteId, shape: { shape: "circle", centre: { latitude: 18.5, longitude: 73.8 }, radiusM: 100 }, validFrom: "2026-01-01T00:00:00Z", reason: "Initial fence from the survey" }).then((v) => approveGeofence(app, p.checker, v.id, "Checked against the survey drawing"));
      await addLocations(app, p.maker, p.projectId, generateChainageStretches({ fromM: 0, toM: 250, stepM: 250, sides: ["LHS"], codePrefix: "CH" }));
      await transitionProject(app, p.maker, { id: p.projectId, to: "tendering", reason: "Tender issued", approvedBy: p.checker.userId });
      await transitionProject(app, p.maker, { id: p.projectId, to: "awarded", reason: "Award received", approvedBy: p.checker.userId });
      await transitionProject(app, p.maker, { id: p.projectId, to: "mobilisation", reason: "Mobilisation begins", approvedBy: p.checker.userId });
      await expectRefused(transitionProject(app, p.maker, { id: p.projectId, to: "active", reason: "Start work now", approvedBy: p.checker.userId }), "VALIDATION_FAILED", "RACI");
    });

    it("refuses closure from the defect period while allocations and module items are open, and records the exception path", async () => {
      const tenant = randomUUID();
      const p = await roadProject(tenant);
      await createAllocation(app, p.maker, { userRef: randomUUID(), projectId: p.projectId, roleOnProject: "Engineer", validFrom: "2025-01-01", validTo: "2030-12-31", allocationPct: 50, reason: REASON });
      for (const to of ["tendering", "awarded", "mobilisation"] as const) {
        await transitionProject(app, p.maker, { id: p.projectId, to, reason: `Move to ${to}`, approvedBy: p.checker.userId });
      }
      await transitionProject(app, p.maker, { id: p.projectId, to: "active", reason: "Start work on the ring road", approvedBy: p.checker.userId, exception: { reason: "RACI follows in the next release", approvedBy: contextFor(tenant).userId } });
      await transitionProject(app, p.maker, { id: p.projectId, to: "substantially_complete", reason: "Works substantially complete", approvedBy: p.checker.userId });
      await transitionProject(app, p.maker, { id: p.projectId, to: "dlp", reason: "Defect liability period starts", approvedBy: p.checker.userId });
      await expectRefused(transitionProject(app, p.maker, { id: p.projectId, to: "closed", reason: "Close after the defect period", approvedBy: p.checker.userId }), "VALIDATION_FAILED", "active allocation");
      await transitionProject(app, p.maker, { id: p.projectId, to: "closed", reason: "Closed with the open items recorded", approvedBy: p.checker.userId, exception: { reason: "Module items are closed in their own systems", approvedBy: contextFor(tenant).userId } });
    });
  });
});
