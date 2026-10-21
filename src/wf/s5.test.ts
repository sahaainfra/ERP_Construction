// Part 16 S5 pure tests: the evidence panel lists every declared source, shows what is unavailable with its reason (REQ-WF-F13, A-150), and
// carries the cumulative figure the decision was made on.
import { describe, expect, it } from "vitest";
import { buildEvidence, EVIDENCE_SOURCES } from "./evidence";

describe("evidence panel (REQ-WF-F13, A-150)", () => {
  const view = buildEvidence({ docType: "po", amountPaise: 45_000_000, priorPaise: 90_000_000, history: [{ action: "submit", actor: "ACME00003", at: "2026-10-21T09:00:00Z" }] });

  it("lists every declared source once, in order, and none is left out", () => {
    expect(view.sections.map((s) => s.id)).toEqual(EVIDENCE_SOURCES.map((s) => s.id));
  });

  it("shows the cash forecast as unavailable with its reason, never hidden", () => {
    const cash = view.sections.find((s) => s.id === "treasury.cash");
    expect(cash).toMatchObject({ status: "unavailable", reason: "Cash forecast unavailable: the treasury source is not built yet (Part 65)" });
    expect(view.unavailableCount).toBe(EVIDENCE_SOURCES.filter((s) => !s.built).length);
  });

  it("shows the same-key cumulative figure the decision is made on", () => {
    const amount = view.sections.find((s) => s.id === "workflow.amount");
    expect(amount).toMatchObject({ status: "available", value: { amountPaise: 45_000_000, priorPaise: 90_000_000, cumulativePaise: 135_000_000 } });
  });

  it("shows the approval history as available", () => {
    expect(view.sections.find((s) => s.id === "workflow.history")).toMatchObject({ status: "available", value: [{ action: "submit" }] });
  });
});
