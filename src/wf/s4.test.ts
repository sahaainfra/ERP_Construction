// Part 16 S4 pure tests: the inbox risk flags, with unavailable sources shown explicitly (A-150), and the bulk approval rule (CP-WF-03).
import { describe, expect, it } from "vitest";
import { bulkEligible, riskFlags, UNAVAILABLE_SOURCES, type InboxItem } from "./inbox";

const item = (extra: Partial<InboxItem> = {}): InboxItem => ({
  taskId: 1, instanceId: 1, docType: "po", docId: "PO-1", step: "review", amountPaise: 5_000_000, submittedBy: "ACME00003",
  emergency: false, dueAt: null, slaState: "running", delegatedFrom: null, sodWarning: false, splitFinding: false, ...extra,
});

describe("inbox risk flags (REQ-WF-F12, A-150)", () => {
  it("shows every unbuilt source as unavailable, never leaves one out", () => {
    const flags = riskFlags(item());
    for (const source of UNAVAILABLE_SOURCES) expect(flags).toContain(`unavailable:${source}`);
  });

  it("shows the timer, emergency, conflict and split flags when they apply", () => {
    expect(riskFlags(item({ slaState: "expired" }))).toContain("sla_expired");
    expect(riskFlags(item({ slaState: "reminder_50" }))).toContain("sla_reminder");
    expect(riskFlags(item({ emergency: true }))).toContain("emergency");
    expect(riskFlags(item({ sodWarning: true }))).toContain("sod_warning");
    expect(riskFlags(item({ splitFinding: true }))).toContain("split_finding");
  });
});

describe("bulk approval (REQ-WF-F12, CP-WF-03)", () => {
  const clean = () => [item({ taskId: 1 }), item({ taskId: 2, docId: "PO-2" })];
  const noFlags = () => [] as ReturnType<typeof riskFlags>;

  it("is off until the owner sets a bulk limit", () => {
    expect(bulkEligible(clean(), null, noFlags)).toEqual({ allowed: false, reasons: ["bulk approval is off until the owner sets its limit"] });
  });

  it("allows a clean, same-type set below the limit", () => {
    expect(bulkEligible(clean(), 10_000_000, noFlags)).toEqual({ allowed: true, reasons: [] });
  });

  it("refuses unavailable checks, warnings and exceptions, which the inbox always shows", () => {
    expect(bulkEligible(clean(), 10_000_000).allowed).toBe(false);
    expect(bulkEligible([item({ sodWarning: true })], 10_000_000, noFlags).reasons.join(" ")).toMatch(/warning/);
    expect(bulkEligible([item({ splitFinding: true })], 10_000_000, noFlags).reasons.join(" ")).toMatch(/warning/);
  });

  it("refuses mixed types, items above the limit, and emergency approvals", () => {
    expect(bulkEligible([item(), item({ docType: "mr", docId: "MR-1" })], 10_000_000, noFlags).reasons).toContain("items must be of one document type");
    expect(bulkEligible([item({ amountPaise: 20_000_000 })], 10_000_000, noFlags).reasons).toContain("an item is above the bulk limit or has no amount");
    expect(bulkEligible([item({ emergency: true })], 10_000_000, noFlags).reasons).toContain("an emergency approval cannot be approved in bulk");
  });
});
