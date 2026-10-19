// Contract and procurement models (Part 00 Annex B2) and typical project structures (Annex B11).

export const CONTRACT_MODELS = [
  "Item-rate / BOQ",
  "Percentage rate (above/below SOR)",
  "Lump sum",
  "EPC / turnkey",
  "HAM (hybrid annuity)",
  "BOT/TOT",
  "Cost-plus (fee)",
  "Rate contract (framework)",
  "Work order",
  "Labour-only",
  "Supply-only",
  "Supply-and-install",
  "Plant hire (with/without operator, dry/wet)",
  "Design-build",
  "Back-to-back subcontract",
  "Nominated subcontract",
  "JV/consortium (integrated or non-integrated)",
] as const;

/** Standard conditions held as configuration templates (Annex B2). */
export const STANDARD_CONDITIONS = [
  "CPWD GCC",
  "State PWD GCC",
  "MoRTH/NHAI EPC and HAM model agreements",
  "FIDIC Red, Yellow and Silver books",
  "Private client forms",
] as const;

/** A project hierarchy from Annex B11. Each level is a node type in the WBS or location breakdown. */
export interface ProjectStructure {
  name: string;
  levels: readonly string[];
  note?: string;
}

export const PROJECT_STRUCTURES: readonly ProjectStructure[] = [
  {
    name: "Building",
    levels: ["Project", "Tower/Block", "Floor", "Zone/Flat", "Element (footing, column, beam, slab, wall)", "Activity"],
  },
  {
    name: "Road/highway",
    levels: [
      "Project",
      "Package",
      "Stretch (chainage from–to)",
      "Layer (embankment, subgrade, GSB, WMM, DBM, BC) or Structure (culvert, minor bridge, ROB, VUP)",
      "Activity",
    ],
    note: "Track LHS, RHS and median.",
  },
  {
    name: "Bridge/metro viaduct",
    levels: ["Project", "Pier/Span/Segment", "Element", "Activity"],
    note: "Casting yard is a production unit.",
  },
  {
    name: "Industrial/EPC",
    levels: ["Project", "Area/Unit", "System", "Sub-system", "Equipment/Tag", "Activity"],
    note: "Engineering deliverables and vendor data requirements attach here.",
  },
  {
    name: "Water/pipeline",
    levels: ["Project", "Zone", "Network/Line (chainage)", "Node/Chamber", "Activity"],
    note: "Hydro-test sections.",
  },
];

/** Annex B11: the location breakdown structure is separate from the WBS and CBS. */
export const LOCATION_RULE =
  "The location breakdown structure (LBS) is separate from the WBS and CBS; transactions carry the most specific location available.";
