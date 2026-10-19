// Golden cases (Part 01 REQ-DISC-F12): one worked example per calculation in src/domain, plus program
// invariants and rendered outputs. Each case is run with fixed inputs; the result is stored in
// docs/erp-program/GOLDEN_OUTPUTS/baseline.json and compared on every check.
// The time zone is pinned to Asia/Kolkata (AC-7 default) so date-based results do not depend on the machine.
process.env.TZ = "Asia/Kolkata";

import { createHash } from "node:crypto";
import * as kpi from "../domain/kpi";
import * as commercial from "../domain/commercial";
import * as reinforcement from "../domain/reinforcement";
import { formworkWearPerUse } from "../domain/norms";
import { findNumbering, formatDocumentNumber } from "../domain/numbering";
import { PARTS, getPart, partKey, phaseOf, transitiveDependencies } from "./index";
import { verifyProgram } from "./verify";
import { partsForLegacyPrompt, startMode } from "./legacy";
import { renderPartPrompt } from "./prompts";
import { isValid } from "./conventions";

export type GoldenValue = number | string | boolean | null | GoldenValue[] | { [key: string]: GoldenValue };

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

export function goldenCases(): Record<string, GoldenValue> {
  return {
    // B7 KPI formulas (kpi.ts)
    "kpi.physicalProgress": kpi.physicalProgress([{ weight: 50, percentComplete: 100 }, { weight: 50, percentComplete: 50 }]),
    "kpi.spi": kpi.spi(80, 100),
    "kpi.cpi": kpi.cpi(80, 100),
    "kpi.scheduleVariance": kpi.scheduleVariance(80, 100),
    "kpi.costVariance": kpi.costVariance(100, 80),
    "kpi.eacCpi": kpi.eacCpi(1000, 0.8),
    "kpi.etc": kpi.etc(1250, 100),
    "kpi.vac": kpi.vac(1000, 1250),
    "kpi.tcpi": kpi.tcpi(1000, 400, 500),
    "kpi.grossMargin": kpi.grossMargin(1000, 800),
    "kpi.cvrMargin": kpi.cvrMargin({
      certified: 800, workDoneNotCertified: 100, agreedVariations: 50, probabilityWeightedPending: 100,
      actualCost: 700, accruals: 50, provisions: 30,
    }),
    "kpi.underOverBilling": kpi.underOverBilling(500, 400),
    "kpi.materialVariance": kpi.materialVariance({ actualQty: 55, executedQty: 100, normPerUnit: 0.5, wastageAllowance: 0.02 }),
    "kpi.plantUtilisation": kpi.plantUtilisation(500, 720, 120),
    "kpi.plantAvailability": kpi.plantAvailability(100, 10),
    "kpi.mtbf": kpi.mtbf(1000, 4),
    "kpi.mttr": kpi.mttr(20, 4),
    "kpi.labourProductivityIndex": kpi.labourProductivityIndex(200, 10, 25),
    "kpi.dso": kpi.dso(300, 1000, 90),
    "kpi.dpo": kpi.dpo(200, 1000, 60),
    "kpi.certificationLagDays": kpi.certificationLagDays(d(2026, 1, 1), d(2026, 1, 15)),
    "kpi.workingDaysBetween": kpi.workingDaysBetween(d(2026, 1, 5), d(2026, 1, 12)),
    "kpi.rfiTurnaroundDays": kpi.rfiTurnaroundDays(d(2026, 1, 5), d(2026, 1, 12), ["2026-01-07"]),
    "kpi.ltifr": kpi.ltifr(2, 500_000),
    "kpi.trifr": kpi.trifr(5, 1_000_000),
    "kpi.firstTimeInspectionPass": kpi.firstTimeInspectionPass(9, 10),
    "kpi.costOfQuality": kpi.costOfQuality({ rework: 10, ncr: 20, testing: 30, inspection: 40 }),
    "kpi.vendorOtif": kpi.vendorOtif(8, 10),
    "kpi.procurementCycleDays": kpi.procurementCycleDays(d(2026, 1, 1), d(2026, 1, 11)),

    // B3 commercial terms (commercial.ts)
    "commercial.mobilisationAdvanceRecovery": commercial.mobilisationAdvanceRecovery({
      advance: 1000, contractValue: 10_000, startPct: 10, endPct: 50, cumulativeWorkBefore: 2000, workInBill: 1000,
    }),
    "commercial.securedAdvanceLimit": commercial.securedAdvanceLimit({ quantity: 100, invoiceRate: 50, sorRate: 60 }),
    "commercial.securedAdvanceRecovery": commercial.securedAdvanceRecovery({
      advanceAmount: 3750, materialQuantity: 100, consumedQuantity: 40, outstanding: 1000,
    }),
    "commercial.retentionDeduction": commercial.retentionDeduction({ billValue: 1000, retainedToDate: 1990, contractValue: 100_000, capPct: 2 }),
    "commercial.priceVariation": commercial.priceVariation({
      variableValue: 100_000,
      components: [
        { share: 0.3, baseIndex: 100, currentIndex: 110 },
        { share: 0.2, baseIndex: 200, currentIndex: 180 },
      ],
    }),
    "commercial.netDelay": commercial.netDelay(10, 3),
    "commercial.liquidatedDamages": commercial.liquidatedDamages({ contractValue: 1_000_000, ratePerUnit: 0.0005, delayUnits: 4, capFraction: 0.1 }),
    "commercial.earlyCompletionBonus": commercial.earlyCompletionBonus({ ratePerDay: 1000, daysEarly: 5, cap: 4000 }),
    "commercial.deviationSplit": { ...commercial.deviationSplit({ boqQty: 100, actualQty: 130 }) },

    // B4 reinforcement (reinforcement.ts)
    "reinforcement.unitWeightKgPerM": reinforcement.unitWeightKgPerM(16),
    "reinforcement.cutLengthMm": reinforcement.cutLengthMm({ diameterMm: 12, straightSegmentsMm: [1000], hookAllowancesMm: [200], bendAnglesDeg: [90] }),
    "reinforcement.barWeightKg": reinforcement.barWeightKg({ diameterMm: 12, straightSegmentsMm: [1000] }),

    // B6 norms (norms.ts)
    "norms.formworkWearPerUse": formworkWearPerUse(100),

    // B8 numbering (numbering.ts)
    "numbering.formatDocumentNumber": formatDocumentNumber("PO/{PRJ}/{FY}/{SEQ:5}", { PRJ: "MTR3", FY: "2026-27", SEQ: 42 }),
    "numbering.findNumbering.INV.gapFree": findNumbering("INV").gapFree ?? false,

    // Program invariants and lookups (Annex C and D)
    "program.partCount": PARTS.length,
    "program.verifyViolations": verifyProgram().length,
    "program.phaseOf.25A": phaseOf("25A").phase,
    "program.partKey.08A": partKey("08A"),
    "program.transitiveDependencies.86": transitiveDependencies("86").size,
    "program.startMode.01": startMode("01"),
    "program.defaultMode.02": getPart("02").defaultMode,
    "legacy.partsForLegacyPrompt.09": partsForLegacyPrompt("09"),

    // Annex E rendering and §1.3 conventions
    "prompts.E1.25A.sha256": sha256(renderPartPrompt("E1", "25A", { slice: "S2", repo: "<repo>" }).text),
    "conventions.examples": [
      isValid("requirement", "REQ-PROC-F07"),
      isValid("controlPoint", "CP-PROC-03"),
      isValid("permission", "proc.po.approve"),
      isValid("api", "/api/v1/proc/purchase-orders"),
      isValid("table", "proc_purchase_orders"),
    ],
  };
}

// Repository artefacts whose content is part of the baseline. A changed hash is reported for review;
// a removed artefact is destructive.
export const ARTIFACTS = [
  "docs/erp-program/PROGRAM_RULES.md",
  "docs/erp-program/annexes/annex-c-master-index.md",
  "docs/erp-program/annexes/annex-d-legacy-mapping.md",
  "docs/erp-program/annexes/annex-e-session-prompts.md",
  "design/design-tokens.json",
  "design/navigation-registry.json",
  "src/program/parts.generated.json",
  "src/program/legacy.generated.json",
  "src/program/prompts.generated.json",
  "src/design/tokens.css",
  "src/domain/kpi.ts",
  "src/domain/commercial.ts",
  "src/domain/reinforcement.ts",
  "src/domain/numbering.ts",
  "src/domain/norms.ts",
  "src/domain/uom.ts",
  "src/domain/roles.ts",
  "src/domain/structures.ts",
  "src/domain/statutory.ts",
  "src/domain/glossary.ts",
];
