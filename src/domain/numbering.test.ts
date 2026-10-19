import { describe, expect, it } from "vitest";
import { DOCUMENT_NUMBERING, findNumbering, formatDocumentNumber, templateTokens } from "./numbering";

describe("document numbering", () => {
  it("zero-pads numeric sequences to the token width", () => {
    expect(formatDocumentNumber("PO/{PRJ}/{FY}/{SEQ:5}", { PRJ: "MTR3", FY: "2026-27", SEQ: 42 })).toBe(
      "PO/MTR3/2026-27/00042",
    );
  });

  it("builds a number with string segments unchanged", () => {
    expect(formatDocumentNumber("RA/{CTR}/{NN}", { CTR: "CTR-7", NN: "03" })).toBe("RA/CTR-7/03");
  });

  it("refuses to build a number with a missing segment", () => {
    expect(() => formatDocumentNumber("GRN/{STORE}/{FY}/{SEQ}", { STORE: "S1", FY: "2026-27" })).toThrow(RangeError);
    expect(() => formatDocumentNumber("GRN/{STORE}/{FY}/{SEQ}", { STORE: "", FY: "2026-27", SEQ: 1 })).toThrow(RangeError);
  });

  it("lists the tokens a template needs, including hyphenated names", () => {
    expect(templateTokens("INV/{GSTIN-STATE}/{FY}/{SEQ}")).toEqual(["GSTIN-STATE", "FY", "SEQ"]);
  });

  it("marks tax invoices as a gap-free series", () => {
    expect(findNumbering("INV").gapFree).toBe(true);
  });

  it("has a unique code for every seed", () => {
    const codes = DOCUMENT_NUMBERING.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
