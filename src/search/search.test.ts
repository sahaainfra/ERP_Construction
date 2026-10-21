// Part 13 S3 pure tests: query parsing, typed prefixes, and the synonym expansion rule.
import { describe, expect, it } from "vitest";
import { parseQuery, expandedQuery, SYNONYM_SEED } from "./query";

describe("query parsing (REQ-DASH-F08)", () => {
  it("treats plain text as text and a typed prefix as a type", () => {
    expect(parseQuery("  bridge ")).toEqual({ query: { text: "bridge", prefix: null, entityType: null }, problem: null, notIndexed: null });
    expect(parseQuery("proj: metro")).toEqual({ query: { text: "metro", prefix: "proj", entityType: "project" }, problem: null, notIndexed: null });
    expect(parseQuery("emp: asha").query?.entityType).toBe("person");
  });
  it("says so for a prefix whose module is not built, rather than returning nothing", () => {
    expect(parseQuery("po: P2")).toEqual({ query: null, problem: null, notIndexed: "po" });
    expect(parseQuery("vendor: sahaa").notIndexed).toBe("vendor");
  });
  it("refuses an empty or over-long query", () => {
    expect(parseQuery("   ").problem).toMatch(/between 1 and 100/);
    expect(parseQuery("x".repeat(101)).problem).toMatch(/between 1 and 100/);
  });
});

describe("synonyms (A-97)", () => {
  it("expands a term to its approved synonym, quoted, and leaves other text alone", () => {
    const map = new Map([["tmt", ["reinforcement steel"]]]);
    expect(expandedQuery("TMT", map)).toBe('TMT or "reinforcement steel"');
    expect(expandedQuery("bridge", map)).toBe("bridge");
  });
  it("never lets quote characters from an expansion change the query syntax", () => {
    expect(expandedQuery("tmt", new Map([["tmt", ['steel"or"x']]]))).toBe('tmt or "steelorx"');
  });
  it("starts from the owner's proposed list, which is not in effect until approved", () => {
    expect(SYNONYM_SEED).toEqual([["tmt", "reinforcement steel"], ["shuttering", "formwork"], ["jcb", "backhoe loader"]]);
  });
});
