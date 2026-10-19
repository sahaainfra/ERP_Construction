// Architecture fitness scoring (Part 01 §7 rubric; REQ-DISC-F10). Scores are 0–5 per dimension, or null where a
// dimension does not apply to the component. Null dimensions drop out and the weights are renormalised.
// Recommendations are advisory; Part 02 decides.

export const DIMENSIONS = [
  { key: "functional", label: "Functional fit", weight: 25 },
  { key: "integrity", label: "Data integrity", weight: 20 },
  { key: "performance", label: "Scalability & performance", weight: 15 },
  { key: "security", label: "Security", weight: 15 },
  { key: "maintainability", label: "Maintainability", weight: 10 },
  { key: "currency", label: "Technology currency", weight: 5 },
  { key: "integration", label: "Integration & events", weight: 5 },
  { key: "observability", label: "Observability & operability", weight: 5 },
] as const;

export type DimensionKey = (typeof DIMENSIONS)[number]["key"];
export type Scores = Partial<Record<DimensionKey, number | null>>;

export interface Component {
  name: string;
  scores: Scores;
  /** Evidence for each scored dimension (file, command or measured value). */
  evidence: Partial<Record<DimensionKey, string>>;
  /** Part 00 §7.3 criterion number (1–5) with the evidence that it is met, or null. */
  replaceCriterion: { id: 1 | 2 | 3 | 4 | 5; evidence: string } | null;
}

export type Recommendation =
  | "NOT SCORED"
  | "KEEP / EXTEND"
  | "EXTEND with targeted REFACTOR"
  | "REPLACE-candidate"
  | "REFACTOR (REPLACE not justified)";

export function weightedScore(scores: Scores): number | null {
  let total = 0;
  let weight = 0;
  for (const dim of DIMENSIONS) {
    const value = scores[dim.key];
    if (value === null || value === undefined) continue;
    total += value * dim.weight;
    weight += dim.weight;
  }
  return weight === 0 ? null : total / weight;
}

/** §7 rule: ≥3.5 KEEP/EXTEND; 2.5–3.5 EXTEND with targeted REFACTOR; <2.5 REPLACE-candidate only with a §7.3 criterion. */
export function recommend(weighted: number | null, replaceCriterion: Component["replaceCriterion"]): Recommendation {
  if (weighted === null) return "NOT SCORED";
  if (weighted >= 3.5) return "KEEP / EXTEND";
  if (weighted >= 2.5) return "EXTEND with targeted REFACTOR";
  return replaceCriterion ? "REPLACE-candidate" : "REFACTOR (REPLACE not justified)";
}

/** §7: a security score of 0 always raises a Critical finding to Part 08, whatever the total. */
export const raisesCriticalToPart08 = (scores: Scores): boolean => scores.security === 0;

export const COMPONENTS: readonly Component[] = [
  {
    name: "Application shell and design system (src/app, src/components, src/design)",
    scores: { functional: 2, integrity: null, performance: null, security: 0, maintainability: 3, currency: 2, integration: null, observability: 0 },
    evidence: {
      functional: "Shell, nav and launchpad empty state only (inventory appRoutes: 1 route)",
      security: "No authentication. The permission check in src/design/navigation.ts returns true for every entry (permission null)",
      maintainability: "Typed, lint clean, 3 component files; no UI tests",
      currency: "next 15.5.28 has a moderate advisory (fix in 16.4.2); postcss high advisory via next (production scope)",
      observability: "No logging, metrics or tracing",
    },
    replaceCriterion: null,
  },
  {
    name: "Domain formula library (src/domain)",
    scores: { functional: 3, integrity: 0, performance: null, security: null, maintainability: 4, currency: 5, integration: 1, observability: null },
    evidence: {
      functional: "42 formulas from Annex B3, B4, B6, B7 with worked examples; not persisted",
      integrity: "JavaScript number arithmetic for money. Golden case commercial.priceVariation = 999.9999999999995 (expected 1000)",
      maintainability: "Pure functions, 111 repository tests including golden coverage",
      currency: "TypeScript 5",
      integration: "Function API only; no events or services",
    },
    replaceCriterion: {
      id: 5,
      evidence: "Floating-point money: golden case commercial.priceVariation = 999.9999999999995. AC-7 forbids floating point for money.",
    },
  },
  {
    name: "Program index, generators and checks (src/program, scripts/erp-program)",
    scores: { functional: 4, integrity: 4, performance: null, security: null, maintainability: 4, currency: 5, integration: null, observability: null },
    evidence: {
      functional: "Annex C index, Annex D crosswalk, Annex E templates, adoption and baseline outputs",
      integrity: "Generators fail on malformed rows; invariant checks C3 pass; baseline classifier separates destructive from additive",
      maintainability: "Generators and tests; 111 repository tests",
      currency: "TypeScript 5, tsx 4",
    },
    replaceCriterion: null,
  },
  {
    name: "Design token pipeline and contrast gate (design, scripts/build-tokens.mjs, scripts/check-design.mjs)",
    scores: { functional: 4, integrity: 3, performance: null, security: null, maintainability: 4, currency: 5, integration: null, observability: null },
    evidence: {
      functional: "Generates three themes and three densities; gate recomputes 72 contrast pairings",
      integrity: "Gate reports 4 failing token pairings (CF-004); the token values do not meet DS-7",
      maintainability: "Two small Node scripts, documented in README",
      currency: "Node ESM",
    },
    replaceCriterion: null,
  },
];

/** Components that the rubric cannot score because they do not exist yet (Part 01 §2: nothing is scored as if it did). */
export const NOT_PRESENT = [
  "Database schema and migrations (Part 03)",
  "Authentication, authorisation and SoD (Parts 07, 08A)",
  "Workflow and approvals (Part 16)",
  "Protocol and control engine (Part 17)",
  "Audit trail (Part 08)",
  "Event bus and notifications (Parts 10, 25)",
  "Document service (Part 19)",
  "Reporting and dashboards (Parts 13, 76)",
  "Calculation engine (Part 22)",
  "Integrations and integration hub (Part 11)",
  "Mobile and offline engine (Part 14)",
  "CI/CD pipeline (Part 04): no .github or other CI configuration",
  "Infrastructure, backup and restore (Parts 03, 84)",
  "Observability (Part 09)",
];

export function fitnessTable(): string {
  const header = `| Component | ${DIMENSIONS.map((d) => d.label).join(" | ")} | Weighted | Recommendation |`;
  const rule = `|---|${DIMENSIONS.map(() => "---").join("|")}|---|---|`;
  const rows = COMPONENTS.map((c) => {
    const w = weightedScore(c.scores);
    const cells = DIMENSIONS.map((d) => {
      const v = c.scores[d.key];
      return v === null || v === undefined ? "N/A" : String(v);
    });
    return `| ${c.name} | ${cells.join(" | ")} | ${w === null ? "—" : w.toFixed(2)} | ${recommend(w, c.replaceCriterion)}${raisesCriticalToPart08(c.scores) ? " · Critical to Part 08" : ""} |`;
  });
  return [header, rule, ...rows].join("\n");
}
