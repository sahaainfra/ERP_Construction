// Project and site acceptance tests (Part 06 S2). Run against TEST_DATABASE_URL and TEST_APP_DATABASE_URL; skipped without them.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { approveRecord, createLegalEntity, createUnit } from "./structure";
import { createProject, createSite, createTemplate, getProject, transitionProject, transitionSite } from "./projects";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const REASON = "Master data for the Pune road project";
const SAMPLE_PAN = "AAPFU0939F";

function contextFor(tenantId: string, userId = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: ["super_admin"], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

/** Expects a refusal with the code; the text is looked for in the reason and the field errors. */
async function expectRefused(work: Promise<unknown>, code: string, text?: string): Promise<void> {
  const error = await work.then(
    () => null,
    (e: { code?: string; reason?: string; fieldErrors?: unknown }) => e,
  );
  expect(error, "expected the write to be refused").not.toBeNull();
  expect(error).toMatchObject({ code });
  if (text) expect(`${(error as { reason?: string }).reason} ${JSON.stringify((error as { fieldErrors?: unknown }).fieldErrors)}`).toContain(text);
}

describe.skipIf(!TEST_URL || !APP_URL)("projects and sites (Part 06 S2)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-projtest" });
    app = createPool(APP_URL!, { application_name: "erp-projtest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** One approved legal entity, company and branch, and the makers and checkers used in the tests. */
  async function setup(tenant: string) {
    const maker = contextFor(tenant);
    const checker = contextFor(tenant);
    const entity = await createLegalEntity(app, maker, { code: "MAIN", legalName: "Saha Constructions Pvt Ltd", pan: SAMPLE_PAN, registeredAddress: "12 Industrial Road, Pune", reason: REASON });
    await approveRecord(app, checker, "legal_entity", entity.id, "Checked against the incorporation papers");
    const company = await createUnit(app, maker, { unitType: "company", code: "CO1", name: "Saha Constructions", legalEntityId: entity.id, reason: REASON });
    await approveRecord(app, checker, "unit", company.id, "Checked against the org chart");
    const branch = await createUnit(app, maker, { unitType: "branch", code: "BR-PUN", name: "Pune branch", parentId: company.id, legalEntityId: entity.id, reason: REASON });
    await approveRecord(app, checker, "unit", branch.id, "Checked against the org chart");
    return { maker, checker, entityId: entity.id, branchId: branch.id };
  }

  async function approvedProject(tenant: string, s: Awaited<ReturnType<typeof setup>>, code = "PRJ-1") {
    const { id } = await createProject(app, s.maker, { code, name: "Pune ring road", legalEntityId: s.entityId, branchUnitId: s.branchId, projectType: "road_highway", reason: REASON, plannedStart: "2026-12-01", plannedFinish: "2028-06-30" });
    await approveRecord(app, s.checker, "project", id, "Checked against the award letter");
    void tenant;
    return id;
  }

  describe("project master and templates (REQ-ORG-F03, F11)", () => {
    it("applies a template's contract mode once; a later template edit does not change the project", async () => {
      const tenant = randomUUID();
      const s = await setup(tenant);
      await createTemplate(app, s.maker, { code: "road_ehc", name: "Road, EPC", projectType: "road_highway", defaultContractMode: "item_rate" });
      const { id } = await createProject(app, s.maker, { code: "PRJ-T", name: "Templated road", legalEntityId: s.entityId, projectType: "road_highway", templateCode: "road_ehc", reason: REASON });
      await withTransaction(app, (c) => c.query("UPDATE org_project_templates SET default_contract_mode = 'lump_sum' WHERE template_code = 'road_ehc'"), { tenantId: tenant });
      const row = await withTransaction(app, (c) => c.query<{ contract_mode: string; template_code: string }>("SELECT contract_mode, template_code FROM org_projects WHERE id = $1", [id]), { tenantId: tenant });
      expect(row.rows[0]).toEqual({ contract_mode: "item_rate", template_code: "road_ehc" });
    });

    it("refuses a template for a different project type, and a project under an unapproved legal entity", async () => {
      const tenant = randomUUID();
      const s = await setup(tenant);
      await createTemplate(app, s.maker, { code: "bld_std", name: "Building", projectType: "building" });
      await expectRefused(createProject(app, s.maker, { code: "PRJ-X", name: "Wrong template", legalEntityId: s.entityId, projectType: "road_highway", templateCode: "bld_std", reason: REASON }), "VALIDATION_FAILED", "different project type");
      const pending = await createLegalEntity(app, s.maker, { code: "PEND", legalName: "Pending Holdings Ltd", pan: "BBBBB1234B", registeredAddress: "3 Pending Street, Delhi", reason: REASON });
      await expectRefused(createProject(app, s.maker, { code: "PRJ-Y", name: "Pending entity", legalEntityId: pending.id, projectType: "building", reason: REASON }), "VALIDATION_FAILED", "approved");
    });

    it("refuses a planned finish before the start, and a branch reference that is not a branch", async () => {
      const tenant = randomUUID();
      const s = await setup(tenant);
      await expectRefused(createProject(app, s.maker, { code: "PRJ-D", name: "Backwards dates", legalEntityId: s.entityId, projectType: "building", reason: REASON, plannedStart: "2027-01-01", plannedFinish: "2026-01-01" }), "VALIDATION_FAILED", "before");
      await expectRefused(createProject(app, s.maker, { code: "PRJ-B", name: "Wrong unit", legalEntityId: s.entityId, projectType: "building", branchUnitId: 999999, reason: REASON }), "VALIDATION_FAILED", "branchUnitId");
    });

    it("is pending until a second person approves it, and the creator cannot approve it", async () => {
      const tenant = randomUUID();
      const s = await setup(tenant);
      const { id } = await createProject(app, s.maker, { code: "PRJ-A", name: "Approval test", legalEntityId: s.entityId, projectType: "building", reason: REASON });
      const status = await getProject(app, s.maker, id);
      expect(status).toMatchObject({ approvalStatus: "pending", lifecycleStatus: "proposed" });
      await expectRefused(approveRecord(app, s.maker, "project", id, "Trying to approve my own project"), "MAKER_CHECKER_REQUIRED");
    });
  });

  describe("sites (REQ-ORG-F05)", () => {
    it("refuses a site under a project that is not approved, and creates one under an approved project", async () => {
      const tenant = randomUUID();
      const s = await setup(tenant);
      const pending = await createProject(app, s.maker, { code: "PRJ-P", name: "Not yet approved", legalEntityId: s.entityId, projectType: "building", reason: REASON });
      const siteInput = { code: "S-MAIN", name: "Main site", siteType: "main_site" as const, stateCode: "27", reason: REASON };
      await expectRefused(createSite(app, s.maker, { ...siteInput, projectId: pending.id }), "VALIDATION_FAILED", "approved");
      const projectId = await approvedProject(tenant, s);
      const site = await createSite(app, s.maker, { ...siteInput, projectId });
      expect(site.id).toBeGreaterThan(0);
      await expectRefused(createSite(app, s.maker, { ...siteInput, code: "S-BAD", projectId, stateCode: "99" }), "VALIDATION_FAILED", "state code");
    });

    it("moves a site Planned to Mobilising, and refuses a skip to Closed", async () => {
      const tenant = randomUUID();
      const s = await setup(tenant);
      const projectId = await approvedProject(tenant, s);
      const { id } = await createSite(app, s.maker, { code: "S-1", name: "Site one", projectId, siteType: "main_site", stateCode: "27", reason: REASON });
      await expectRefused(transitionSite(app, s.maker, { id, to: "closed", reason: "Skip straight to closed", approvedBy: s.checker.userId }), "VALIDATION_FAILED", "cannot move");
      await transitionSite(app, s.maker, { id, to: "mobilising", reason: "Mobilisation starts on site", approvedBy: s.checker.userId });
    });
  });

  describe("lifecycle gates (REQ-ORG-F04; CP-ORG-01, CP-ORG-03)", () => {
    it("refuses an illegal move, and needs a second approver for a legal move", async () => {
      const tenant = randomUUID();
      const s = await setup(tenant);
      const { id } = await createProject(app, s.maker, { code: "PRJ-L", name: "Lifecycle", legalEntityId: s.entityId, projectType: "building", reason: REASON });
      await approveRecord(app, s.checker, "project", id, "Checked against the award letter");
      await expectRefused(transitionProject(app, s.maker, { id, to: "active", reason: "Skip the tender", approvedBy: s.checker.userId }), "VALIDATION_FAILED", "cannot move");
      await expectRefused(transitionProject(app, s.maker, { id, to: "tendering", reason: "Start the tender", approvedBy: s.maker.userId }), "MAKER_CHECKER_REQUIRED");
      await transitionProject(app, s.maker, { id, to: "tendering", reason: "Tender issued to clients", approvedBy: s.checker.userId });
    });

    it("blocks activation while checklist items are missing, and accepts a recorded exception", async () => {
      const tenant = randomUUID();
      const s = await setup(tenant);
      const projectId = await approvedProject(tenant, s);
      for (const to of ["tendering", "awarded", "mobilisation"] as const) {
        await transitionProject(app, s.maker, { id: projectId, to, reason: `Move to ${to} for the test`, approvedBy: s.checker.userId });
      }
      await expectRefused(transitionProject(app, s.maker, { id: projectId, to: "active", reason: "Start work on the ring road", approvedBy: s.checker.userId }), "VALIDATION_FAILED", "geofence");
      await expectRefused(
        transitionProject(app, s.maker, { id: projectId, to: "active", reason: "Start work on the ring road", approvedBy: s.checker.userId, exception: { reason: "Geofence and RACI follow in the next release", approvedBy: s.maker.userId } }),
        "MAKER_CHECKER_REQUIRED",
      );
      await transitionProject(app, s.maker, {
        id: projectId,
        to: "active",
        reason: "Start work on the ring road",
        approvedBy: s.checker.userId,
        exception: { reason: "Geofence and RACI follow in the next release", approvedBy: contextFor(tenant).userId },
      });
      const history = await withTransaction(app, (c) => c.query<{ to_status: string; exception_reason: string }>("SELECT to_status, exception_reason FROM org_project_status_history WHERE project_id = $1 AND to_status = 'active'", [projectId]), { tenantId: tenant });
      expect(history.rows[0]).toEqual({ to_status: "active", exception_reason: "Geofence and RACI follow in the next release" });
    });

    it("makes an archived project read-only: no new sites and no further moves", async () => {
      const tenant = randomUUID();
      const s = await setup(tenant);
      const { id } = await createProject(app, s.maker, { code: "PRJ-Z", name: "Lost tender", legalEntityId: s.entityId, projectType: "building", reason: REASON });
      await approveRecord(app, s.checker, "project", id, "Checked against the tender notice");
      await transitionProject(app, s.maker, { id, to: "tendering", reason: "Tender submitted", approvedBy: s.checker.userId });
      await transitionProject(app, s.maker, { id, to: "closed", reason: "Tender lost to a competitor", approvedBy: s.checker.userId });
      await transitionProject(app, s.maker, { id, to: "archived", reason: "Archive the lost tender", approvedBy: s.checker.userId });
      await expectRefused(createSite(app, s.maker, { code: "S-AR", name: "Late site", projectId: id, siteType: "office", stateCode: "27", reason: REASON }), "CONFLICT");
      await expectRefused(transitionProject(app, s.maker, { id, to: "tendering", reason: "Try to reopen the tender", approvedBy: s.checker.userId }), "CONFLICT");
    });

    it("refuses closure from the defect liability period until the closure checklist exists", async () => {
      const tenant = randomUUID();
      const s = await setup(tenant);
      const projectId = await approvedProject(tenant, s);
      for (const to of ["tendering", "awarded", "mobilisation"] as const) {
        await transitionProject(app, s.maker, { id: projectId, to, reason: `Move to ${to} for the test`, approvedBy: s.checker.userId });
      }
      await transitionProject(app, s.maker, { id: projectId, to: "active", reason: "Start work on the ring road", approvedBy: s.checker.userId, exception: { reason: "Geofence and RACI follow in the next release", approvedBy: contextFor(tenant).userId } });
      await transitionProject(app, s.maker, { id: projectId, to: "substantially_complete", reason: "Works substantially complete", approvedBy: s.checker.userId });
      await transitionProject(app, s.maker, { id: projectId, to: "dlp", reason: "Defect liability period starts", approvedBy: s.checker.userId });
      await expectRefused(transitionProject(app, s.maker, { id: projectId, to: "closed", reason: "Close after the defect period", approvedBy: s.checker.userId }), "VALIDATION_FAILED", "closure checklist");
    });
  });
});
