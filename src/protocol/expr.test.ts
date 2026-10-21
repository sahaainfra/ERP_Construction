// Part 17 S1 tests: the restricted expression language (REQ-PROTOCOL-F03, A-164). It computes over the payload and refuses anything outside
// its grammar, too long, too deep, or with too many tokens.
import { describe, expect, it } from "vitest";
import { evaluateRule, MAX_DEPTH, MAX_LENGTH, MAX_TOKENS, parse } from "./expr";

describe("restricted expression language (A-164)", () => {
  const payload = { qty: 0.8, plan: { remaining: 0.5 }, site: "27", tags: "urgent" };

  it("computes comparisons and arithmetic over payload values", () => {
    expect(evaluateRule("qty <= plan.remaining + 0.3", payload)).toBe(true);
    expect(evaluateRule("qty * 2 > 1.5 and site == '27'", payload)).toBe(true);
    expect(evaluateRule("not (qty < 0) or tags == 'x'", payload)).toBe(true);
  });

  it("treats a missing reference as null, so a comparison with it is false", () => {
    expect(evaluateRule("missing.field == null", payload)).toBe(true);
    expect(evaluateRule("missing > 1", payload)).toBe(false);
  });

  it("refuses a rule that does not evaluate to true or false", () => {
    expect(() => evaluateRule("qty + 1", payload)).toThrow(/true or false/);
  });

  it("refuses function calls, assignment and characters outside the language", () => {
    expect(() => parse("fetch(qty)")).toThrow();
    expect(() => parse("qty = 1")).toThrow();
    expect(() => parse("qty; drop")).toThrow(/not allowed/);
    expect(() => parse("qty $ 2")).toThrow(/not allowed/);
  });

  it("refuses division by zero and arithmetic on text", () => {
    expect(() => evaluateRule("qty / 0 > 1", payload)).toThrow(/division by zero/);
    expect(() => evaluateRule("tags + 1 > 0", payload)).toThrow(/two numbers/);
  });

  it("bounds length, token count and nesting", () => {
    expect(() => parse("1".padEnd(MAX_LENGTH + 1, "+1"))).toThrow(/longer/);
    expect(() => parse(Array.from({ length: MAX_TOKENS + 5 }, () => "1").join("+"))).toThrow(/tokens/);
    expect(() => parse("(".repeat(MAX_DEPTH + 5) + "1" + ")".repeat(MAX_DEPTH + 5))).toThrow(/nested/);
  });

  it("refuses an unclosed text value or parenthesis", () => {
    expect(() => parse("tags == 'urgent")).toThrow(/not closed/);
    expect(() => parse("(qty > 1")).toThrow(/ends too soon|parenthesis/);
  });
});
