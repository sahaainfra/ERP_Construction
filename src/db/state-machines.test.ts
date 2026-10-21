import { describe, expect, it } from "vitest";
import { ACP_MACHINE, BACKFILL_MACHINE, INDEX_MACHINE, LEGACY_LOAD_MACHINE, MIGRATION_MACHINE, canTransition, transition } from "./state-machines";

describe("ACP run (Part 00 §7.4, Part 03 §6)", () => {
  it("moves through the six steps in order", () => {
    let s: string = ACP_MACHINE.initial;
    for (const next of ["expanded", "migrating", "parallel_run", "cutover_ready", "cut_over", "stability_window", "contracted"] as const) {
      s = transition(ACP_MACHINE, s, next);
    }
    expect(s).toBe("contracted");
  });

  it("cannot skip the parallel run", () => {
    expect(() => transition(ACP_MACHINE, "migrating", "cut_over")).toThrow(RangeError);
  });

  it("can roll back from any step", () => {
    for (const s of ["adr_approved", "expanded", "parallel_run", "cut_over"] as const) {
      expect(canTransition(ACP_MACHINE, s, "rolled_back")).toBe(true);
    }
  });

  it("has no way out of contracted", () => {
    expect(canTransition(ACP_MACHINE, "contracted", "expanded")).toBe(false);
  });
});

describe("migration, back-fill, legacy-load and index machines", () => {
  it("runs a migration from draft to verified and forbids applying before dry run", () => {
    expect(canTransition(MIGRATION_MACHINE, "APPROVED", "APPLIED")).toBe(false);
    let s: string = MIGRATION_MACHINE.initial;
    for (const next of ["REVIEWED", "APPROVED", "DRY_RUN_PASSED", "APPLIED", "VERIFIED"]) s = transition(MIGRATION_MACHINE, s, next);
    expect(s).toBe("VERIFIED");
  });

  it("lets a back-fill pause and resume", () => {
    expect(canTransition(BACKFILL_MACHINE, "RUNNING", "PAUSED")).toBe(true);
    expect(canTransition(BACKFILL_MACHINE, "PAUSED", "RUNNING")).toBe(true);
    expect(canTransition(BACKFILL_MACHINE, "RECONCILED", "RUNNING")).toBe(false);
  });

  it("requires owner sign-off before a legacy load", () => {
    expect(canTransition(LEGACY_LOAD_MACHINE, "reconciled", "loaded")).toBe(false);
    expect(canTransition(LEGACY_LOAD_MACHINE, "reconciled", "owner_signed_off")).toBe(true);
  });

  it("requires DBA approval before an index on an existing table", () => {
    expect(canTransition(INDEX_MACHINE, "PLAN_EVIDENCE", "APPLIED")).toBe(false);
    expect(canTransition(INDEX_MACHINE, "PLAN_EVIDENCE", "DBA_APPROVED")).toBe(true);
  });
});
