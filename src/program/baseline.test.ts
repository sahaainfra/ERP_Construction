import { describe, expect, it } from "vitest";
import * as commercial from "../domain/commercial";
import * as kpi from "../domain/kpi";
import * as norms from "../domain/norms";
import * as reinforcement from "../domain/reinforcement";
import { goldenCases } from "./golden";
import { classify, exitCode, type Snapshot } from "./baseline";

const base: Snapshot = { artifacts: { "a.ts": "h1", "b.ts": "h2" }, cases: { "x.spi": 0.8, "x.count": 3 } };

describe("baseline classification (REQ-DISC-F13)", () => {
  it("reports no difference for identical snapshots", () => {
    expect(classify(base, base)).toEqual([]);
    expect(exitCode(classify(base, base))).toBe(0);
  });

  it("treats an added artefact or golden case as additive", () => {
    const current: Snapshot = { artifacts: { ...base.artifacts, "c.ts": "h3" }, cases: { ...base.cases, "x.new": true } };
    const found = classify(base, current);
    expect(found.map((d) => d.kind)).toEqual(["additive", "additive"]);
    expect(exitCode(found)).toBe(0);
  });

  it("treats a removed artefact or golden case as destructive", () => {
    const current: Snapshot = { artifacts: { "a.ts": "h1" }, cases: { "x.spi": 0.8 } };
    const found = classify(base, current);
    expect(found.every((d) => d.kind === "destructive")).toBe(true);
    expect(exitCode(found)).toBe(1);
  });

  it("treats a changed golden output as destructive, since a silent number change breaks N4", () => {
    const current: Snapshot = { artifacts: base.artifacts, cases: { ...base.cases, "x.spi": 0.81 } };
    const found = classify(base, current);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("destructive");
    expect(found[0].detail).toContain("N4");
  });

  it("reports a changed artefact for review without failing the check", () => {
    const current: Snapshot = { artifacts: { ...base.artifacts, "a.ts": "other" }, cases: base.cases };
    const found = classify(base, current);
    expect(found).toEqual([expect.objectContaining({ kind: "changed", key: "a.ts" })]);
    expect(exitCode(found)).toBe(0);
  });
});

describe("golden coverage", () => {
  const cases = goldenCases();
  const functionsOf = (mod: Record<string, unknown>) => Object.entries(mod).filter(([, v]) => typeof v === "function").map(([k]) => k);

  it.each([
    ["kpi", kpi],
    ["commercial", commercial],
    ["reinforcement", reinforcement],
    ["norms", norms],
  ] as const)("has a golden case for every exported function in %s", (name, mod) => {
    for (const fn of functionsOf(mod)) {
      expect(cases, `${name}.${fn}`).toHaveProperty(name === "norms" ? `norms.${fn}` : `${name}.${fn}`);
    }
  });

  it("produces the same golden values on every run", () => {
    expect(JSON.stringify(goldenCases())).toBe(JSON.stringify(cases));
  });
});
