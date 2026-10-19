// Construction glossary from Part 00 Annex B12. Abbreviations that carry more than one meaning are listed with
// every meaning; the context decides which one applies.

export interface GlossaryEntry {
  term: string;
  meaning: string;
  alsoMeans?: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  { term: "BOQ", meaning: "Bill of quantities" },
  { term: "CBS", meaning: "Cost breakdown structure" },
  { term: "WBS", meaning: "Work breakdown structure" },
  { term: "LBS", meaning: "Location breakdown structure" },
  { term: "MB", meaning: "Measurement book" },
  { term: "RA bill", meaning: "Running account bill" },
  { term: "DPR", meaning: "Daily progress report" },
  { term: "WA", meaning: "Work authorisation" },
  { term: "MTO", meaning: "Material take-off" },
  { term: "BBS", meaning: "Bar bending schedule" },
  { term: "CS", meaning: "Comparative statement" },
  { term: "GRN", meaning: "Goods receipt note" },
  { term: "MRN", meaning: "Material return note" },
  { term: "STO", meaning: "Stock transfer order" },
  { term: "IR / RFI (inspection)", meaning: "Inspection request" },
  { term: "ITP", meaning: "Inspection and test plan" },
  { term: "NCR", meaning: "Non-conformance report" },
  { term: "CAPA", meaning: "Corrective and preventive action" },
  { term: "PTW", meaning: "Permit to work" },
  { term: "JSA/HIRA", meaning: "Job safety analysis / hazard identification and risk assessment" },
  { term: "TBT", meaning: "Toolbox talk" },
  { term: "EOT", meaning: "Extension of time" },
  { term: "LD", meaning: "Liquidated damages" },
  { term: "DLP", meaning: "Defect liability period" },
  { term: "CVR", meaning: "Cost-value reconciliation" },
  { term: "EAC/ETC", meaning: "Estimate at complete / estimate to complete" },
  { term: "PV/EV/AC", meaning: "Planned value / earned value / actual cost" },
  { term: "SOR/DSR", meaning: "Schedule of rates / Delhi schedule of rates" },
  { term: "PMC", meaning: "Project management consultant" },
  { term: "IFC", meaning: "Issued for construction" },
  { term: "VDR", meaning: "Vendor data requirements" },
  {
    term: "IRN",
    meaning: "Invoice reference number (e-invoice)",
    alsoMeans: "Inspection release note in expediting",
  },
  { term: "ROW", meaning: "Right of way" },
  { term: "RMC", meaning: "Ready-mix concrete" },
  { term: "HMP", meaning: "Hot-mix plant" },
  { term: "WMM", meaning: "Wet mix macadam" },
  { term: "TM", meaning: "Transit mixer" },
  { term: "BG/LC", meaning: "Bank guarantee / letter of credit" },
];
