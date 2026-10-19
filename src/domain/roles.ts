// Expert panel (Part 00 Annex B1) and default persona catalogue (Annex B10). Persona names are Part 07 seeds:
// all configurable, and they map to permission roles only through Part 07.

export interface ExpertRole {
  role: string;
  accountable: string;
  decisions: string;
  controls: string;
}

export const EXPERT_PANEL: readonly ExpertRole[] = [
  {
    role: "Project Director",
    accountable: "Delivery of the portfolio or project on time, cost, quality and safety",
    decisions: "Baseline approval, EOT strategy, resource re-allocation, escalation response, client relationship",
    controls: "Single Project 360; early warning on SPI, CPI, EAC and cash; no surprises at month-end; every red KPI drillable to cause and owner",
  },
  {
    role: "CFO",
    accountable: "Cash, margins, books, compliance and funding",
    decisions: "Payment prioritisation, working capital, BG/LC limits, project P&L sign-off, provisioning",
    controls: "Posting only via rules; period locks; sub-ledger equals GL; P&L is not cash; 13-week cash forecast; maker-checker on payments and bank masters; statutory filings on time",
  },
  {
    role: "Procurement In-charge",
    accountable: "Right material or service, right price, right time",
    decisions: "Vendor selection, negotiation, rate contracts, expediting, split awards",
    controls: "At least 3 quotes above threshold; L1 or justified; budget check; benchmark rates; no split POs; vendor performance",
  },
  {
    role: "Store In-charge",
    accountable: "Custody and accuracy of stock at site",
    decisions: "Receipt acceptance, issue against authorisation, transfer, physical verification, write-off proposals",
    controls: "No issue without WA or indent; GRN with evidence; FIFO or batch; cycle counts; theoretical vs actual consumption; custody segregated from procurement",
  },
  {
    role: "Quantity Surveyor",
    accountable: "Measurement, certification, billing quantities, subcontract bills and variations",
    decisions: "MB entry, check measurement, rate for extra items, deviation statements",
    controls: "Quantity chain integrity; MB ↔ drawing ↔ DPR; billed ≤ certified; deviation limits; reconciliation of material against work done",
  },
  {
    role: "Planning Manager",
    accountable: "Baseline, updates, look-ahead, resource loading and delay analysis",
    decisions: "Baseline approval, recovery plans, constraint removal, EOT time-impact",
    controls: "Versioned baselines; status-date discipline; critical path and float tracking; productivity norms; plan before execute",
  },
  {
    role: "Commercial Manager",
    accountable: "Contract value, recoveries, claims, CVR and margin",
    decisions: "Variation pricing, claim strategy, CVR approval, subcontract terms",
    controls: "CVR monthly; variation register; notices within contractual time bars; retention and advance ledgers; LD exposure",
  },
  {
    role: "HR In-charge",
    accountable: "People supply, compliance, payroll and welfare",
    decisions: "Hiring, deployment, wage revisions, statutory filings, labour contractor compliance",
    controls: "Statutory compliance calendar; minimum wages by state and skill; contractor workers' PF and ESI proof before contractor payment; attendance to payroll lock; data privacy",
  },
  {
    role: "Plant Manager",
    accountable: "Fleet availability, utilisation, maintenance and hire",
    decisions: "Allocation, hire and de-hire, repair or replace",
    controls: "Log books vs WA; fuel norms; PM schedule; hired-plant idle alerts",
  },
  {
    role: "QA/QC Manager",
    accountable: "Conformance, testing and NCR closure",
    decisions: "Hold points, material acceptance, NCR disposition",
    controls: "ITP before work; test before use; no billing of non-conforming work",
  },
  {
    role: "HSE Manager",
    accountable: "Zero harm and statutory safety",
    decisions: "Permit approval, stop-work, incident investigation",
    controls: "PTW for hazardous work; competence validity; incident reporting within statutory time",
  },
];

/** Persona groups from Annex B10. Each persona is a Part 07 role seed. */
export const PERSONA_CATALOGUE = {
  management: [
    "Chairman/MD",
    "COO",
    "Project Director",
    "CFO",
    "Head–Commercial",
    "Head–Procurement",
    "Head–HR",
    "Head–QHSE",
  ],
  project: [
    "Project Manager",
    "Planning Engineer",
    "QS",
    "Billing Engineer",
    "Site In-charge",
    "Section Engineer",
    "Supervisor/Foreman",
    "Surveyor",
    "Design Coordinator",
    "Document Controller",
    "QA/QC Engineer",
    "Lab Technician",
    "HSE Officer",
    "Store In-charge",
    "Store Keeper",
    "Plant In-charge",
    "Fleet Manager",
    "Fleet Supervisor",
    "Equipment Operator",
    "Driver",
    "Fuel In-charge",
    "Fuel Attendant",
    "Calibration Officer",
    "Maintenance Manager",
    "Mechanic/Technician",
    "Batching Plant In-charge (RMC Plant Manager)",
    "Plant Operator",
    "Dispatch Manager",
    "Logistics Staff",
    "Laboratory Staff",
    "Production Unit In-charge",
    "Time Keeper",
    "Security In-charge",
    "Camp In-charge",
  ],
  corporate: [
    "Estimator",
    "Tender Manager",
    "Contracts Manager",
    "Buyer",
    "Vendor Development",
    "Accountant",
    "AP/AR Officer",
    "Treasury Officer",
    "Tax Officer",
    "Payroll Officer",
    "HR Manager",
    "HR Executive",
    "Internal Auditor",
    "Protocol/Compliance Officer",
    "Cost Controller",
    "MIS Analyst",
  ],
  technical: [
    // Platform (Website) Administrator: user lifecycle and platform settings only; no business-record rights (Part 08A).
    "Platform (Website) Administrator",
    "User Administrator",
    // Break-glass or just-in-time only.
    "Super Admin",
    "Module Admin",
    "TECH_ADMIN",
    "QA_LEAD",
    "RELEASE_MANAGER",
    "Integration Admin",
    "Data Steward",
  ],
  external: [
    "Client",
    "Consultant/PMC",
    "Supplier",
    "Subcontractor",
    "Labour Contractor",
    "Plant Hirer",
    "Transporter",
    "Auditor (read-only)",
    "Lender's engineer",
  ],
} as const;
