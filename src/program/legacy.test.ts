import { describe, expect, it } from "vitest";
import { PARTS, getPart } from "./index";
import {
  ALIASES,
  CONSOLIDATIONS,
  CROSSWALK,
  PLANT_MODULE,
  VERIFY_EXTEND,
  WORKCHAT_MODULE,
  aliasesFor,
  legacyPromptsForPart,
  partsForLegacyPrompt,
  startMode,
} from "./legacy";

const partIds = new Set(PARTS.map((p) => p.id));

describe("legacy crosswalk (Annex D5)", () => {
  it("maps every old prompt from 00 to 166 exactly once", () => {
    const expected = Array.from({ length: 167 }, (_, i) => String(i).padStart(2, "0"));
    expect(CROSSWALK.map((r) => r.oldPrompt)).toEqual(expected);
  });

  it("points every mapping at a Part that exists in the Annex C index", () => {
    for (const row of CROSSWALK) {
      for (const part of row.newParts) {
        expect(partIds.has(part), `prompt ${row.oldPrompt} → ${part}`).toBe(true);
      }
    }
  });

  it("answers both directions of the mapping", () => {
    expect(partsForLegacyPrompt("09")).toEqual(["13"]);
    expect(legacyPromptsForPart("13")).toContain("09");
    expect(() => partsForLegacyPrompt("167")).toThrow(RangeError);
  });
});

describe("cross-table consistency", () => {
  it("lists exactly the Annex C VERIFY & EXTEND Parts in Annex D2", () => {
    const fromIndex = PARTS.filter((p) => p.defaultMode === "VERIFY & EXTEND").map((p) => p.id).sort();
    const fromD2 = VERIFY_EXTEND.map((r) => r.part).sort();
    expect(fromD2).toEqual(fromIndex);
  });

  it("gives each VERIFY & EXTEND Part at least one legacy-built prompt", () => {
    for (const row of VERIFY_EXTEND) {
      expect(row.legacyBuiltPrompts.length, `Part ${row.part}`).toBeGreaterThan(0);
    }
  });

  it("agrees with D5 on every consolidation (each merged prompt maps to that Part)", () => {
    const failures: string[] = [];
    for (const c of CONSOLIDATIONS) {
      for (const old of c.oldPrompts) {
        const mapped = CROSSWALK.find((r) => r.oldPrompt === old.padStart(2, "0"));
        if (!mapped || !mapped.newParts.includes(c.part)) failures.push(`D3 Part ${c.part} lists ${old}; D5 maps it to ${mapped?.newParts.join(", ")}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("only refers to Parts that exist, in every crosswalk table", () => {
    const refs = [
      ...VERIFY_EXTEND.map((r) => r.part),
      ...CONSOLIDATIONS.map((c) => c.part),
      ...ALIASES.map((a) => a.part),
      ...PLANT_MODULE.flatMap((r) => r.nowInParts),
      ...WORKCHAT_MODULE.flatMap((r) => r.nowInParts),
    ];
    expect(refs.filter((p) => !partIds.has(p))).toEqual([]);
  });
});

describe("start modes and aliases", () => {
  it("starts Part 01 in VERIFY & EXTEND and Part 02 in BUILD", () => {
    expect(startMode("01")).toBe("VERIFY & EXTEND");
    expect(startMode("02")).toBe("BUILD");
  });

  it("keeps legacy codes as aliases, never renaming built identifiers", () => {
    expect(aliasesFor("09")).toEqual(["perf(P131)", "err"]);
    expect(aliasesFor("13")).toEqual(["search", "ux2", "timeline", "drill"]);
    expect(aliasesFor("00")).toEqual([]);
  });

  it("covers the uploaded Plant module's 34 parts and WorkChat module's 27 parts", () => {
    expect(PLANT_MODULE).toHaveLength(34);
    expect(WORKCHAT_MODULE).toHaveLength(27);
    expect(getPart("25C").title).toContain("WorkChat Security");
  });
});
