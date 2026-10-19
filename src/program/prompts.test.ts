import { describe, expect, it } from "vitest";
import { findPlaceholders, getTemplate, renderPartPrompt, renderPhaseGate, TEMPLATES } from "./prompts";

describe("Annex E templates", () => {
  it("extracts every template, including the plain-text variant", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["E1", "E1-legacy", "E2", "E3", "E4", "E5", "E6", "E7", "E8"]);
  });

  it("rejects an unknown template", () => {
    expect(() => getTemplate("E9")).toThrow(RangeError);
  });
});

describe("E1 kick-off for a Part slice", () => {
  const rendered = renderPartPrompt("E1", "25A", { slice: "S2", repo: "sahaainfra/ERP_Construction" });

  it("fills the Part title, code, slice and start mode from the index", () => {
    expect(rendered.text).toContain("Execute PART 25A — WorkChat Conversations");
    expect(rendered.text).toContain("slice S2");
    expect(rendered.text).toContain("module code wchat");
    expect(rendered.text).toContain("default mode VERIFY & EXTEND");
    expect(rendered.text).toContain("Repository: sahaainfra/ERP_Construction");
  });

  it("leaves no index placeholders behind", () => {
    expect(rendered.text).not.toMatch(/<NN>|<TITLE>|<code>|<S#>|<BUILD \| EXTEND/);
  });

  it("reports only the attachment slots as unfilled", () => {
    expect(rendered.unfilled).toEqual([]);
    expect(rendered.text).toContain("<constitution>");
  });
});

describe("E1-legacy dependency list", () => {
  it("lists the Part's direct dependencies from Annex C", () => {
    const rendered = renderPartPrompt("E1-legacy", "25A");
    expect(rendered.text).toContain("confirm every dependency Part 12, 13, 14, 19, 25 is APPROVED");
  });

  it("gives an empty list for Part 00", () => {
    expect(renderPartPrompt("E1-legacy", "00").text).toContain("dependency Part none is APPROVED");
  });
});

describe("E6 VERIFY & EXTEND", () => {
  it("lists the legacy prompts the Part consolidates", () => {
    const rendered = renderPartPrompt("E6", "01");
    expect(rendered.text).toContain("consolidates legacy prompts 01, 00");
  });

  it("refuses a Part that does not start in VERIFY & EXTEND", () => {
    expect(() => renderPartPrompt("E6", "02")).toThrow(/applies only to VERIFY & EXTEND/);
  });
});

describe("E4 phase gate", () => {
  it("fills the phase number and name", () => {
    const rendered = renderPhaseGate(3);
    expect(rendered.text).toContain("Phase 3 — Experience Platform gate.");
    expect(rendered.unfilled).toEqual([]);
  });

  it("rejects an unknown phase", () => {
    expect(() => renderPhaseGate(99)).toThrow(RangeError);
  });
});

describe("placeholder detection", () => {
  it("ignores XML tags but finds angle-bracket placeholders", () => {
    expect(findPlaceholders("<part>x</part> <TITLE> <S#>")).toEqual(["<TITLE>", "<S#>"]);
  });
});
