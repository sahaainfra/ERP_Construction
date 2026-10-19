// Indian statutory and tax reference (Part 00 Annex B5).
// Annex B5 says every item here is seed configuration, effective-dated and owned by a named business role,
// and must be confirmed against the source in force before go-live (N16, AC-7). Nothing below is a rate or
// threshold the ERP may apply until its owner confirms it. The owner roles are proposals: Annex B5 names
// only the tax and HR owners, so the others need confirming.

export type ConfirmationStatus = "seed-unconfirmed" | "confirmed";

export interface StatutoryObligation {
  area: string;
  obligation: string;
  owner: string;
  /** Only present where Annex B5 itself gives a value. */
  seedValue?: { value: number; unit: string; basis: string };
  status: ConfirmationStatus;
}

export const STATUTORY_OBLIGATIONS: readonly StatutoryObligation[] = [
  {
    area: "GST",
    obligation:
      "GSTIN validation; place of supply (CGST+SGST or IGST); works contract service rates; RCM; ITC and blocked credits; e-invoice above notified turnover; e-way bill; returns reconciliation (GSTR-1, GSTR-3B, GSTR-2B/IMS); GST-TDS on specified government contracts",
    owner: "Tax Officer",
    status: "seed-unconfirmed",
  },
  {
    area: "Income tax TDS/TCS",
    obligation:
      "Income-tax Act, 2025 (in force from 1-Apr-2026) consolidates TDS under section 393; legacy references 194C, 194J, 194I, 194Q and 194H apply to historical periods; rates, thresholds, PAN-unavailable rates, lower-deduction certificates, quarterly returns",
    owner: "Tax Officer",
    status: "seed-unconfirmed",
  },
  {
    area: "Labour law",
    obligation:
      "Four Labour Codes in force from 21-Nov-2025 (Wages; Industrial Relations; Social Security; Occupational Safety, Health and Working Conditions). Minimum wages by state, zone and skill; wage definition (50 % rule); PF and ESI contributions and ceilings; professional tax; labour welfare fund; contractor licensing; registers and returns",
    owner: "HR In-charge",
    status: "seed-unconfirmed",
  },
  {
    area: "Building and other construction workers' cess",
    obligation: "Cess on construction cost, and worker registration",
    owner: "HR In-charge",
    seedValue: { value: 1, unit: "% of construction cost", basis: "Annex B5 seed" },
    status: "seed-unconfirmed",
  },
  {
    area: "MSME payments",
    obligation: "Track payment timeline for MSME-registered vendors",
    owner: "CFO",
    seedValue: { value: 45, unit: "days", basis: "Annex B5 seed" },
    status: "seed-unconfirmed",
  },
  {
    area: "Other permits and levies",
    obligation:
      "TDS on rent or lease of plant; stamp duty on contracts and BGs (state); environmental consents (CTE, CTO); explosives licences; labour licences; fire NOC; height clearance; tree felling; mining royalty and transit passes for borrowed earth and aggregates",
    owner: "Project Director",
    status: "seed-unconfirmed",
  },
];
