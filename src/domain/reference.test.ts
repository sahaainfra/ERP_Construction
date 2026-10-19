import { describe, expect, it } from "vitest";
import { BRASS_TO_CFT, findUnit, UNITS_OF_MEASURE } from "./uom";
import { formworkWearPerUse, SEED_WASTAGE } from "./norms";
import { EXPERT_PANEL, PERSONA_CATALOGUE } from "./roles";
import { PROJECT_STRUCTURES } from "./structures";
import { STATUTORY_OBLIGATIONS } from "./statutory";
import { GLOSSARY } from "./glossary";

describe("reference seeds", () => {
  it("has unique unit codes and resolves them", () => {
    const codes = UNITS_OF_MEASURE.map((u) => u.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(findUnit("bag").dimension).toBe("packaging");
    expect(() => findUnit("furlong")).toThrow(RangeError);
    expect(BRASS_TO_CFT.factor).toBe(100);
  });

  it("carries the B6 wastage seeds", () => {
    expect(SEED_WASTAGE.cement).toBe(0.02);
    expect(SEED_WASTAGE.timber).toBe(0.1);
    expect(formworkWearPerUse(100)).toBe(0.01);
    expect(() => formworkWearPerUse(0)).toThrow(RangeError);
  });

  it("covers the eleven expert roles in B1", () => {
    expect(EXPERT_PANEL).toHaveLength(11);
  });

  it("keeps the technical personas separate from business personas", () => {
    expect(PERSONA_CATALOGUE.technical).toContain("Super Admin");
    expect(PERSONA_CATALOGUE.corporate).not.toContain("Super Admin");
  });

  it("lists the five B11 structures", () => {
    expect(PROJECT_STRUCTURES.map((s) => s.name)).toEqual([
      "Building",
      "Road/highway",
      "Bridge/metro viaduct",
      "Industrial/EPC",
      "Water/pipeline",
    ]);
  });

  it("marks every statutory item unconfirmed until its owner confirms it", () => {
    expect(STATUTORY_OBLIGATIONS.every((s) => s.status === "seed-unconfirmed")).toBe(true);
    const cess = STATUTORY_OBLIGATIONS.find((s) => s.area.includes("cess"));
    expect(cess?.seedValue?.value).toBe(1);
  });

  it("has a glossary entry for every abbreviation with its meaning", () => {
    expect(GLOSSARY.every((g) => g.meaning.length > 0)).toBe(true);
    expect(GLOSSARY.find((g) => g.term === "IRN")?.alsoMeans).toBeDefined();
  });
});
