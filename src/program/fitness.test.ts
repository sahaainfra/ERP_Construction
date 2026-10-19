import { describe, expect, it } from "vitest";
import { COMPONENTS, DIMENSIONS, raisesCriticalToPart08, recommend, weightedScore } from "./fitness";

describe("fitness rubric (Part 01 §7)", () => {
  it("weights the eight dimensions to 100", () => {
    expect(DIMENSIONS.reduce((sum, d) => sum + d.weight, 0)).toBe(100);
  });

  it("renormalises over the dimensions that apply", () => {
    // Only functional (25) at 4 and maintainability (10) at 2: (100 + 20) / 35 = 3.428…
    expect(weightedScore({ functional: 4, maintainability: 2 })).toBeCloseTo(120 / 35);
    expect(weightedScore({ functional: null })).toBeNull();
  });

  it.each([
    [3.5, null, "KEEP / EXTEND"],
    [3.0, null, "EXTEND with targeted REFACTOR"],
    [2.4, null, "REFACTOR (REPLACE not justified)"],
    [2.4, { id: 5 as const, evidence: "x" }, "REPLACE-candidate"],
    [null, null, "NOT SCORED"],
  ])("maps weighted %s with criterion %j to %s", (score, criterion, expected) => {
    expect(recommend(score, criterion)).toBe(expected);
  });

  it("raises a Critical finding for any security score of 0", () => {
    expect(raisesCriticalToPart08({ security: 0 })).toBe(true);
    expect(raisesCriticalToPart08({ security: 1 })).toBe(false);
  });

  it("reproduces the recorded scores for each scored component", () => {
    const [shell, domain, program, tokens] = COMPONENTS.map((c) => weightedScore(c.scores));
    expect(shell).toBeCloseTo(1.5);
    expect(domain).toBeCloseTo(145 / 65);
    expect(program).toBeCloseTo(245 / 60);
    expect(tokens).toBeCloseTo(225 / 60);
  });

  it("gives the application shell a Critical finding, because it has no authentication", () => {
    expect(raisesCriticalToPart08(COMPONENTS[0].scores)).toBe(true);
  });

  it("only proposes REPLACE where a §7.3 criterion is evidenced", () => {
    for (const c of COMPONENTS) {
      if (recommend(weightedScore(c.scores), c.replaceCriterion) === "REPLACE-candidate") {
        expect(c.replaceCriterion).not.toBeNull();
      }
    }
  });
});
