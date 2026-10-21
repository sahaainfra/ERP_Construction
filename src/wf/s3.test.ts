// Part 16 S3 pure tests: working-day due times (A-155), SLA reminder thresholds and expiry (REQ-WF-F08), the amendment summary (REQ-WF-F09,
// A-148), and the delegation input rules (REQ-WF-F07, A-156).
import { describe, expect, it } from "vitest";
import { addWorkingDays, slaState } from "./calendar";
import { changesOf } from "./amend";
import { checkDelegationInput } from "./delegation";

describe("working calendar and SLA windows (REQ-WF-F08, A-155)", () => {
  it("skips the weekend when counting working days", () => {
    // Friday 23 October 2026 plus one working day is Monday 26 October 2026, at the same time of day.
    const due = addWorkingDays(new Date("2026-10-23T09:00:00Z"), 1);
    expect(due.toISOString()).toBe("2026-10-26T09:00:00.000Z");
    expect(addWorkingDays(new Date("2026-10-23T09:00:00Z"), 0).toISOString()).toBe("2026-10-23T09:00:00.000Z");
  });

  it("skips a holiday the owner has supplied", () => {
    const due = addWorkingDays(new Date("2026-10-22T09:00:00Z"), 1, { weekend: [0, 6], holidays: ["2026-10-23"] });
    expect(due.toISOString()).toBe("2026-10-26T09:00:00.000Z");
  });

  it("moves through running, reminder at 50 %, reminder at 90 %, and expired", () => {
    const created = new Date("2026-10-19T09:00:00Z");
    const due = new Date("2026-10-23T09:00:00Z");
    expect(slaState(created, due, new Date("2026-10-19T12:00:00Z"))).toBe("running");
    expect(slaState(created, due, new Date("2026-10-21T09:00:00Z"))).toBe("reminder_50");
    expect(slaState(created, due, new Date("2026-10-23T00:00:00Z"))).toBe("reminder_90");
    expect(slaState(created, due, new Date("2026-10-23T09:00:00Z"))).toBe("expired");
  });
});

describe("amendment summary (REQ-WF-F09, A-148)", () => {
  it("lists only the fields that changed, sorted by name", () => {
    const changes = changesOf({ qty: 40, rate: 1200, site: "27" }, { qty: 45, rate: 1200, site: "27", note: "extra cement" });
    expect(changes).toEqual([
      { field: "note", before: undefined, after: "extra cement" },
      { field: "qty", before: 40, after: 45 },
    ]);
  });

  it("finds no change when the two versions are the same", () => {
    expect(changesOf({ qty: 40 }, { qty: 40 })).toEqual([]);
  });
});

describe("delegation input (REQ-WF-F07, A-156)", () => {
  const base = { delegator: "ACME00001", delegate: "ACME00002", docType: "po", validFrom: "2026-10-21T00:00:00Z", validTo: "2026-10-28T00:00:00Z", reason: "On leave for a week" };
  it("accepts a valid delegation", () => {
    expect(() => checkDelegationInput(base)).not.toThrow();
  });
  it("refuses delegation to oneself, a short reason, and an end before the start", () => {
    expect(() => checkDelegationInput({ ...base, delegate: "ACME00001" })).toThrow(/themselves/);
    expect(() => checkDelegationInput({ ...base, reason: "leave" })).toThrow(/too short/);
    expect(() => checkDelegationInput({ ...base, validTo: "2026-10-20T00:00:00Z" })).toThrow(/after the start/);
  });
});
