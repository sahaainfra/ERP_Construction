// Document numbering seeds from Part 00 Annex B8.
// Tokens are written {NAME}, or {NAME:width} to zero-pad a number (for example {SEQ:5}).
// Numbers are allocated by the sequence service (Part 03), not by string formatting alone; this module
// only builds and checks the readable form.

export interface NumberingSeed {
  code: string;
  label: string;
  template: string | null;
  /** Gap-free series: allocation must not skip or reuse a number (tax invoices, credit and debit notes). */
  gapFree?: boolean;
  note?: string;
}

export const DOCUMENT_NUMBERING: readonly NumberingSeed[] = [
  { code: "TND", label: "Tender", template: "TND/{CO}/{FY}/{SEQ}" },
  { code: "EST", label: "Estimate", template: "EST/{TND}/{REV}" },
  { code: "CTR", label: "Contract", template: "CTR/{PRJ}/{SEQ}" },
  { code: "BOQ", label: "BOQ version", template: "BOQ/{PRJ}/{VER}" },
  { code: "BUD", label: "Budget", template: "BUD/{PRJ}/{TYPE}/{VER}" },
  { code: "MR", label: "Material request", template: "MR/{PRJ}/{FY}/{SEQ}" },
  { code: "PR", label: "Purchase requisition", template: "PR/{PRJ}/{FY}/{SEQ}" },
  { code: "RFQ", label: "Request for quotation", template: "RFQ/{PRJ}/{FY}/{SEQ}" },
  { code: "CS", label: "Comparative statement", template: "CS/{PRJ}/{FY}/{SEQ}" },
  { code: "PO", label: "Purchase order", template: "PO/{PRJ}/{FY}/{SEQ:5}" },
  { code: "WO", label: "Work order", template: "WO/{PRJ}/{FY}/{SEQ}" },
  { code: "GRN", label: "Goods receipt note", template: "GRN/{STORE}/{FY}/{SEQ}" },
  { code: "ISS", label: "Issue", template: "ISS/{STORE}/{FY}/{SEQ}" },
  { code: "STO", label: "Stock transfer order", template: "STO/{FY}/{SEQ}" },
  { code: "GP", label: "Gate pass", template: "GP/{SITE}/{FY}/{SEQ}" },
  { code: "WA", label: "Work authorisation", template: "WA/{PRJ}/{DATE}/{SEQ}" },
  { code: "DPR", label: "Daily progress report", template: "DPR/{PRJ}/{DATE}" },
  { code: "MB", label: "Measurement book", template: "MB/{PRJ}/{BOOK}/{PAGE}" },
  { code: "RA", label: "Running account bill", template: "RA/{CTR}/{NN}" },
  { code: "SB", label: "Subcontract bill", template: "SB/{WO}/{NN}" },
  {
    code: "INV",
    label: "Tax invoice",
    template: "INV/{GSTIN-STATE}/{FY}/{SEQ}",
    gapFree: true,
  },
  {
    code: "CN-DN",
    label: "Credit and debit note",
    template: null,
    gapFree: true,
    note: "Annex B8 requires a gap-free series but gives no pattern; the pattern is a configuration decision.",
  },
  { code: "JV", label: "Journal voucher", template: "JV/{CO}/{FY}/{SEQ}" },
  { code: "PAY", label: "Payment", template: "PAY/{CO}/{FY}/{SEQ}" },
  { code: "NCR", label: "Non-conformance report", template: "NCR/{PRJ}/{SEQ}" },
  { code: "RFI", label: "Request for inspection", template: "RFI/{PRJ}/{DISC}/{SEQ}" },
  { code: "PTW", label: "Permit to work", template: "PTW/{SITE}/{DATE}/{SEQ}" },
  { code: "VO", label: "Variation order", template: "VO/{CTR}/{SEQ}" },
  { code: "CLM", label: "Claim", template: "CLM/{CTR}/{SEQ}" },
  { code: "TRN", label: "Transmittal", template: "TRN/{PRJ}/{SEQ}" },
  { code: "OUT", label: "Letter out", template: "OUT/{PRJ}/{FY}/{SEQ}" },
  { code: "IN", label: "Letter in", template: "IN/{PRJ}/{FY}/{SEQ}" },
];

const TOKEN = /\{([A-Za-z0-9_-]+)(?::(\d+))?\}/g;

/** Names of the tokens a template needs, in order of first appearance. */
export function templateTokens(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(TOKEN)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/**
 * Builds a document number from a template. Throws if any token has no value, so a number is never
 * produced with a blank segment. Numeric values are zero-padded when the token gives a width.
 */
export function formatDocumentNumber(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(TOKEN, (_whole, name: string, width?: string) => {
    const value = values[name];
    if (value === undefined || value === "") throw new RangeError(`Missing value for token {${name}}`);
    if (typeof value === "number" && width !== undefined) return String(value).padStart(Number(width), "0");
    return String(value);
  });
}

export function findNumbering(code: string): NumberingSeed {
  const seed = DOCUMENT_NUMBERING.find((s) => s.code === code);
  if (!seed) throw new RangeError(`No numbering seed for ${code}`);
  return seed;
}
