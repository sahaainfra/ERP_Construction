// Enterprise structure acceptance tests (Part 06 S1). Run against TEST_DATABASE_URL and TEST_APP_DATABASE_URL; skipped without them.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { buildContext, type RequestContext } from "../core/context";
import { addRegistration, approveRecord, createCentre, createLegalEntity, createUnit, deactivateUnit, getUnit, reparentUnit } from "./structure";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const SAMPLE_GSTIN = "27AAPFU0939F1ZV";
const SAMPLE_PAN = "AAPFU0939F";
const REASON = "Initial master data load for the group";

function contextFor(tenantId: string, userId = randomUUID()): RequestContext {
  return buildContext(
    { tenantId, companyId: randomUUID(), projectIds: [], siteIds: [], userId, roles: ["super_admin"], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" },
    "api",
    `corr-${randomUUID()}`,
  );
}

/** Expects a refusal with the given code. The text is looked for in the reason and in the field errors. */
async function expectRefused(work: Promise<unknown>, code: string, messagePart?: string): Promise<void> {
  const error = await work.then(
    () => null,
    (e: { code?: string; reason?: string; fieldErrors?: unknown }) => e,
  );
  expect(error, "expected the write to be refused").not.toBeNull();
  expect(error).toMatchObject({ code });
  if (messagePart) expect(`${(error as { reason?: string }).reason} ${JSON.stringify((error as { fieldErrors?: unknown }).fieldErrors)}`).toContain(messagePart);
}

describe.skipIf(!TEST_URL || !APP_URL)("enterprise structure (Part 06 S1)", () => {
  let owner: Pool;
  let app: Pool;

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-orgtest" });
    app = createPool(APP_URL!, { application_name: "erp-orgtest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  /** Creates and approves a legal entity by one maker and one checker. Returns its id and the checker's context. */
  async function approvedEntity(tenant: string, code = "MAIN", pan = SAMPLE_PAN) {
    const maker = contextFor(tenant);
    const checker = contextFor(tenant);
    const { id } = await createLegalEntity(app, maker, { code, legalName: "Saha Constructions Pvt Ltd", pan, registeredAddress: "12 Industrial Road, Pune", reason: REASON });
    await approveRecord(app, checker, "legal_entity", id, "Checked against the incorporation papers");
    return { id, maker, checker };
  }

  async function approvedUnit(tenant: string, input: Parameters<typeof createUnit>[2], checker: RequestContext, maker: RequestContext) {
    const { id } = await createUnit(app, maker, input);
    await approveRecord(app, checker, "unit", id, "Checked against the org chart");
    return id;
  }

  describe("legal entities and registrations (REQ-ORG-F01)", () => {
    it("creates a legal entity pending approval, and the creator cannot approve it", async () => {
      const tenant = randomUUID();
      const maker = contextFor(tenant);
      const { id } = await createLegalEntity(app, maker, { code: "MAIN", legalName: "Saha Constructions Pvt Ltd", pan: SAMPLE_PAN, registeredAddress: "12 Industrial Road, Pune", reason: REASON });
      const status = await withTransaction(app, (c) => c.query<{ approval_status: string }>("SELECT approval_status FROM org_legal_entities WHERE id = $1", [id]), { tenantId: tenant });
      expect(status.rows[0].approval_status).toBe("pending");
      await expectRefused(approveRecord(app, maker, "legal_entity", id, "Trying to approve my own record"), "MAKER_CHECKER_REQUIRED");
    });

    it("approves once, by a second person, and refuses a second decision", async () => {
      const tenant = randomUUID();
      const { id, checker } = await approvedEntity(tenant);
      await expectRefused(approveRecord(app, checker, "legal_entity", id, "Second attempt at approval"), "CONFLICT");
    });

    it("refuses a duplicate code or PAN in the same tenant with a conflict, not a raw database error", async () => {
      const tenant = randomUUID();
      await approvedEntity(tenant, "MAIN", SAMPLE_PAN);
      await expectRefused(
        createLegalEntity(app, contextFor(tenant), { code: "OTHER", legalName: "Another Company Ltd", pan: SAMPLE_PAN, registeredAddress: "Somewhere 1, Delhi", reason: REASON }),
        "CONFLICT",
      );
    });

    it("refuses a GSTIN whose PAN does not match the legal entity", async () => {
      const tenant = randomUUID();
      const { id, maker } = await approvedEntity(tenant, "MAIN", "BBBBB1234B");
      await expectRefused(
        addRegistration(app, maker, id, { registrationType: "GSTIN", stateCode: "27", number: SAMPLE_GSTIN, validFrom: "2026-04-01" }),
        "VALIDATION_FAILED",
        "PAN",
      );
    });

    it("adds a valid GSTIN and refuses the same GSTIN twice", async () => {
      const tenant = randomUUID();
      const { id, maker } = await approvedEntity(tenant);
      await addRegistration(app, maker, id, { registrationType: "GSTIN", stateCode: "27", number: SAMPLE_GSTIN, validFrom: "2026-04-01", documentRef: "doc-gst-27" });
      await expectRefused(addRegistration(app, maker, id, { registrationType: "GSTIN", stateCode: "27", number: SAMPLE_GSTIN, validFrom: "2026-04-01" }), "CONFLICT");
    });
  });

  describe("hierarchy (REQ-ORG-F01, F02; §6)", () => {
    it("builds group, company, business unit, division, branch and department in allowed order", async () => {
      const tenant = randomUUID();
      const { id: entity, maker, checker } = await approvedEntity(tenant);
      const group = await approvedUnit(tenant, { unitType: "group", code: "GRP", name: "Saha Group", reason: REASON }, checker, maker);
      const company = await approvedUnit(tenant, { unitType: "company", code: "CO1", name: "Saha Constructions", parentId: group, legalEntityId: entity, reason: REASON }, checker, maker);
      const bu = await approvedUnit(tenant, { unitType: "business_unit", code: "BU-ROAD", name: "Roads", parentId: company, reason: REASON }, checker, maker);
      const division = await approvedUnit(tenant, { unitType: "division", code: "DIV-E", name: "Earthworks", parentId: bu, reason: REASON }, checker, maker);
      const branch = await approvedUnit(tenant, { unitType: "branch", code: "BR-PUN", name: "Pune branch", parentId: company, legalEntityId: entity, stateCode: "27", latitude: 18.52, longitude: 73.85, reason: REASON }, checker, maker);
      const dept = await approvedUnit(tenant, { unitType: "department", code: "DEP-HR", name: "Human resources", parentId: division, reason: REASON }, checker, maker);
      expect((await getUnit(app, maker, dept))?.parentId).toBe(division);
      expect((await getUnit(app, maker, branch))?.unitType).toBe("branch");
    });

    it("refuses a parent that the unit type may not sit under", async () => {
      const tenant = randomUUID();
      const { id: entity, maker, checker } = await approvedEntity(tenant);
      const company = await approvedUnit(tenant, { unitType: "company", code: "CO1", name: "Saha Constructions", legalEntityId: entity, reason: REASON }, checker, maker);
      const branch = await approvedUnit(tenant, { unitType: "branch", code: "BR-PUN", name: "Pune branch", parentId: company, legalEntityId: entity, reason: REASON }, checker, maker);
      await expectRefused(createUnit(app, maker, { unitType: "business_unit", code: "BU-X", name: "Under a branch", parentId: branch, reason: REASON }), "VALIDATION_FAILED", "cannot sit under");
    });

    it("refuses a child under a parent that is not yet approved", async () => {
      const tenant = randomUUID();
      const { id: entity, maker, checker } = await approvedEntity(tenant);
      const { id: company } = await createUnit(app, maker, { unitType: "company", code: "CO1", name: "Not yet approved", legalEntityId: entity, reason: REASON });
      await expectRefused(createUnit(app, maker, { unitType: "branch", code: "BR-1", name: "Branch under pending company", parentId: company, legalEntityId: entity, reason: REASON }), "VALIDATION_FAILED", "approved first");
      void checker;
    });

    it("refuses a branch without a legal entity", async () => {
      const tenant = randomUUID();
      const { maker, checker } = await approvedEntity(tenant);
      const company = await approvedUnit(tenant, { unitType: "group", code: "GRP", name: "Saha Group", reason: REASON }, checker, maker);
      const { id: entity } = await approvedEntity(tenant, "SECOND", "CCCCC1234C");
      const co = await approvedUnit(tenant, { unitType: "company", code: "CO-2", name: "Second company", legalEntityId: entity, reason: REASON }, checker, maker);
      await expectRefused(createUnit(app, maker, { unitType: "branch", code: "BR-1", name: "No entity branch", parentId: co, reason: REASON }), "VALIDATION_FAILED", "legalEntityId");
      void company;
    });

    it("refuses a reparent that would create a cycle, and needs a second approver", async () => {
      const tenant = randomUUID();
      const { id: entity, maker, checker } = await approvedEntity(tenant);
      const company = await approvedUnit(tenant, { unitType: "company", code: "CO1", name: "Saha Constructions", legalEntityId: entity, reason: REASON }, checker, maker);
      const bu = await approvedUnit(tenant, { unitType: "business_unit", code: "BU-ROAD", name: "Roads", parentId: company, reason: REASON }, checker, maker);
      const division = await approvedUnit(tenant, { unitType: "division", code: "DIV-E", name: "Earthworks", parentId: bu, reason: REASON }, checker, maker);
      await expectRefused(
        reparentUnit(app, maker, { unitId: bu, newParentId: division, effectiveFrom: "2026-11-01", reason: "Move under its own child", approvedBy: checker.userId }),
        "VALIDATION_FAILED",
        "cycle",
      );
      await expectRefused(
        reparentUnit(app, maker, { unitId: bu, newParentId: company, effectiveFrom: "2026-11-01", reason: "Self approval attempt", approvedBy: maker.userId }),
        "MAKER_CHECKER_REQUIRED",
      );
    });

    it("reparents with an effective date, records the history, and never edits it", async () => {
      const tenant = randomUUID();
      const { id: entity, maker, checker } = await approvedEntity(tenant);
      const company = await approvedUnit(tenant, { unitType: "company", code: "CO1", name: "Saha Constructions", legalEntityId: entity, reason: REASON }, checker, maker);
      const bu1 = await approvedUnit(tenant, { unitType: "business_unit", code: "BU-A", name: "Roads", parentId: company, reason: REASON }, checker, maker);
      const bu2 = await approvedUnit(tenant, { unitType: "business_unit", code: "BU-B", name: "Buildings", parentId: company, reason: REASON }, checker, maker);
      const dept = await approvedUnit(tenant, { unitType: "department", code: "DEP-PL", name: "Planning", parentId: bu1, reason: REASON }, checker, maker);
      await reparentUnit(app, maker, { unitId: dept, newParentId: bu2, effectiveFrom: "2026-11-01", reason: "Planning moves to buildings", approvedBy: checker.userId });
      expect((await getUnit(app, maker, dept))?.parentId).toBe(bu2);
      const history = await withTransaction(app, (c) => c.query<{ change_kind: string; old_parent_id: string; new_parent_id: string; effective_from: Date }>("SELECT change_kind, old_parent_id, new_parent_id, effective_from FROM org_unit_history WHERE unit_id = $1", [dept]), { tenantId: tenant });
      expect(history.rows).toHaveLength(1);
      expect(history.rows[0]).toMatchObject({ change_kind: "reparented", old_parent_id: String(bu1), new_parent_id: String(bu2) });
    });

    it("refuses to deactivate a unit that still has active children", async () => {
      const tenant = randomUUID();
      const { id: entity, maker, checker } = await approvedEntity(tenant);
      const company = await approvedUnit(tenant, { unitType: "company", code: "CO1", name: "Saha Constructions", legalEntityId: entity, reason: REASON }, checker, maker);
      await approvedUnit(tenant, { unitType: "business_unit", code: "BU-A", name: "Roads", parentId: company, reason: REASON }, checker, maker);
      await expectRefused(deactivateUnit(app, maker, { unitId: company, effectiveFrom: "2026-11-01", reason: "Retire the company", approvedBy: checker.userId }), "VALIDATION_FAILED", "active child");
    });
  });

  describe("cost and profit centres (REQ-ORG-F01)", () => {
    it("requires a centre type for a cost centre and an approved unit when one is linked", async () => {
      const tenant = randomUUID();
      const { id: entity, maker, checker } = await approvedEntity(tenant);
      const company = await approvedUnit(tenant, { unitType: "company", code: "CO1", name: "Saha Constructions", legalEntityId: entity, reason: REASON }, checker, maker);
      await expectRefused(createCentre(app, maker, "cost_centre", { code: "CC-1", name: "No type", validFrom: "2026-04-01", reason: REASON }), "VALIDATION_FAILED", "centreType");
      const { id: pending } = await createUnit(app, maker, { unitType: "business_unit", code: "BU-P", name: "Pending unit", parentId: company, reason: REASON });
      await expectRefused(createCentre(app, maker, "profit_centre", { code: "PC-1", name: "Linked to pending", validFrom: "2026-04-01", reason: REASON, unitId: pending }), "VALIDATION_FAILED", "approved first");
      const ok = await createCentre(app, maker, "cost_centre", { code: "CC-PL", name: "Plant overhead", centreType: "plant", validFrom: "2026-04-01", reason: REASON, unitId: company });
      expect(ok.id).toBeGreaterThan(0);
    });
  });

  describe("isolation and retention (REQ-ORG-F01; §6)", () => {
    it("does not show another tenant's units", async () => {
      const a = randomUUID();
      const { id: entity, maker, checker } = await approvedEntity(a);
      const unit = await approvedUnit(a, { unitType: "company", code: "CO1", name: "Saha Constructions", legalEntityId: entity, reason: REASON }, checker, maker);
      const other = contextFor(randomUUID());
      expect(await getUnit(app, other, unit)).toBeNull();
    });

    it("cannot delete a record: the application role has no delete right", async () => {
      await expect(app.query("DELETE FROM org_units")).rejects.toMatchObject({ code: "42501" });
    });
  });
});
