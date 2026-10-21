// Part 16 S2 pure tests: decision-table evaluation and coverage (REQ-WF-F03), cumulative evaluation and DR-13 (REQ-WF-F04, A-149),
// approver choice (REQ-WF-F05, CP-WF-01, CP-WF-02) and simulation (REQ-WF-F11).
import { describe, expect, it } from "vitest";
import { checkCoverage, evaluate, validateTable, type Table } from "./decision";
import { bandIndex, cumulativeTotal, splitFinding, toPaise } from "./doa";
import { resolveApprover } from "./resolve";
import { simulate } from "./simulate";

const routing: Table = {
  inputs: [
    { name: "docType", type: "text" },
    { name: "amount", type: "number" },
  ],
  hitPolicy: "unique",
  rows: [
    { conditions: { docType: { eq: "po" }, amount: { max: 500000 } }, outputs: { levels: ["site_in_charge"] } },
    { conditions: { docType: { eq: "po" }, amount: { min: 500000, max: 2500000 } }, outputs: { levels: ["procurement_head", "project_manager"] } },
    { conditions: { docType: { eq: "po" }, amount: { min: 2500000 } }, outputs: { levels: ["procurement_head", "project_manager", "management"] } },
  ],
};

describe("decision tables (REQ-WF-F03)", () => {
  it("applies the one rule that matches, including at the boundary", () => {
    expect(evaluate(routing, { docType: "po", amount: 1_200_000 }).outputs).toEqual({ levels: ["procurement_head", "project_manager"] });
    expect(evaluate(routing, { docType: "po", amount: 500_000 }).outputs).toEqual({ levels: ["procurement_head", "project_manager"] });
    expect(evaluate(routing, { docType: "po", amount: 499_999 }).outputs).toEqual({ levels: ["site_in_charge"] });
  });

  it("refuses an input no rule covers, rather than routing it by default", () => {
    expect(() => evaluate(routing, { docType: "mr", amount: 10 })).toThrow(/no decision rule applies/);
  });

  it("reports a gap for a document type no rule names, so other types are never routed by default", () => {
    expect(checkCoverage(routing).gaps.length).toBeGreaterThan(0);
  });

  it("finds a gap when a rule is missing, with an example input", () => {
    const withGap: Table = { ...routing, rows: routing.rows.slice(0, 2) };
    const coverage = checkCoverage(withGap);
    expect(coverage.gaps.length).toBeGreaterThan(0);
    expect(coverage.gaps[0]).toMatchObject({ docType: "po" });
  });

  it("finds an overlap when two unique rules match the same input", () => {
    const overlapping: Table = { ...routing, rows: [...routing.rows, { conditions: { docType: { eq: "po" }, amount: { min: 2000000 } }, outputs: { levels: ["x"] } }] };
    expect(checkCoverage(overlapping).overlaps.length).toBeGreaterThan(0);
  });

  it("reports a complete table with no gaps and no overlaps", () => {
    const amountOnly: Table = { inputs: [{ name: "amount", type: "number" }], hitPolicy: "unique", rows: routing.rows.map((r) => ({ conditions: { amount: r.conditions.amount }, outputs: r.outputs })) };
    const coverage = checkCoverage(amountOnly);
    expect(coverage.gaps).toEqual([]);
    expect(coverage.overlaps).toEqual([]);
  });

  it("refuses a table whose condition does not fit its input type", () => {
    const bad: Table = { ...routing, rows: [{ conditions: { amount: { eq: "lots" } }, outputs: { levels: ["x"] } }] };
    expect(validateTable(bad).join(" ")).toMatch(/amount is a number/);
  });
});

describe("cumulative evaluation and DR-13 (REQ-WF-F04, A-149)", () => {
  const bands = [toPaise(500_000), toPaise(1_000_000), toPaise(2_500_000)];
  const at = "2026-10-21T10:00:00Z";

  it("places an amount in the band whose ceiling it does not exceed", () => {
    expect(bandIndex(toPaise(450_000), bands)).toBe(0);
    expect(bandIndex(toPaise(1_350_000), bands)).toBe(2);
    expect(bandIndex(toPaise(9_000_000), bands)).toBe(3);
  });

  it("adds only the same key's earlier amounts inside the window", () => {
    const prior = [
      { docId: "PO-1", amountPaise: toPaise(450_000), at: "2026-10-19T10:00:00Z" },
      { docId: "PO-2", amountPaise: toPaise(450_000), at: "2026-10-13T10:00:00Z" },
    ];
    expect(cumulativeTotal(prior, { docId: "PO-3", amountPaise: toPaise(450_000), at }, 7)).toBe(toPaise(900_000));
  });

  it("raises DR-13 when three orders of 4.5 lakh to one vendor for one material within seven days move up a band", () => {
    const prior = [
      { docId: "PO-1", amountPaise: toPaise(450_000), at: "2026-10-18T10:00:00Z" },
      { docId: "PO-2", amountPaise: toPaise(450_000), at: "2026-10-19T10:00:00Z" },
    ];
    const cumulative = cumulativeTotal(prior, { docId: "PO-3", amountPaise: toPaise(450_000), at }, 7);
    const result = splitFinding(toPaise(450_000), cumulative, bands);
    expect(result).toEqual({ finding: true, singleBand: 0, cumulativeBand: 2 });
  });

  it("raises no finding when the cumulative total stays in the same band", () => {
    expect(splitFinding(toPaise(100_000), toPaise(200_000), bands).finding).toBe(false);
  });
});

describe("approver choice (REQ-WF-F05, CP-WF-01, CP-WF-02)", () => {
  const amount = toPaise(1_200_000);
  it("chooses the smallest authority that still covers the amount, and never the submitter", () => {
    const result = resolveApprover(
      [
        { userRef: "ACME00010", limitPaise: toPaise(5_000_000), conflicts: 0 },
        { userRef: "ACME00011", limitPaise: toPaise(2_000_000), conflicts: 0 },
        { userRef: "ACME00012", limitPaise: toPaise(9_000_000), conflicts: 0 },
        { userRef: "ACME00003", limitPaise: toPaise(9_000_000), conflicts: 0 },
      ],
      amount,
      "ACME00003",
    );
    expect(result).toEqual({ kind: "resolved", approver: "ACME00011" });
  });

  it("skips anyone with an enforced conflict on the document", () => {
    const result = resolveApprover([{ userRef: "ACME00011", limitPaise: toPaise(2_000_000), conflicts: 1 }, { userRef: "ACME00012", limitPaise: toPaise(9_000_000), conflicts: 0 }], amount, "ACME00003");
    expect(result).toEqual({ kind: "resolved", approver: "ACME00012" });
  });

  it("leaves the step unresolved when nobody qualifies, and never approves", () => {
    const result = resolveApprover([{ userRef: "ACME00011", limitPaise: toPaise(500_000), conflicts: 0 }], amount, "ACME00003");
    expect(result).toMatchObject({ kind: "unresolved" });
    expect((result as { reason: string }).reason).toMatch(/waits for an administrator/);
  });
});

describe("simulation (REQ-WF-F11, A-154)", () => {
  it("lists only the documents whose route would change", () => {
    const docs = [
      { docId: "PO-1", inputs: { docType: "po" }, amount: 1_200_000 },
      { docId: "PO-2", inputs: { docType: "po" }, amount: 100_000 },
    ];
    const current = (d: { amount: number }) => (d.amount > 500_000 ? ["procurement_head", "project_manager"] : ["site_in_charge"]);
    const candidate = (d: { amount: number }) => (d.amount > 1_000_000 ? ["procurement_head", "project_manager", "management"] : current(d));
    const result = simulate(docs, current, candidate);
    expect(result.total).toBe(2);
    expect(result.changed.map((c) => c.docId)).toEqual(["PO-1"]);
    expect(result.changed[0].after).toContain("management");
  });
});
