# CALCULATION_REGISTRY

Part 01, REQ-DISC-F06. Every business calculation found in the repository. Input to Part 22 (Central Calculation Engine).

**Scope and method.** The registry is built from the exported-symbol list of `src/domain/` (`inventory.json`, field `exportedSymbols`), not from the keyword scan alone. The keyword scan found 14 candidate lines but misses formulas that use no money keyword (for example `unitWeightKgPerM`). Each row has a golden case in `GOLDEN_OUTPUTS/baseline.json`, which records the output for fixed inputs. The worked examples are the unit tests in `src/domain/*.test.ts`, which were checked by hand against the Annex B formulas.

**Where each formula is implemented.** Only in TypeScript, in `src/domain/`. No database function, trigger, report SQL or front-end calculation exists, because the repository has no database or reports. Formulas that run in the browser: none; the shell does no business arithmetic.

**Precision and rounding.** JavaScript `number` (IEEE 754 double) throughout. No rounding policy is applied. AC-7 requires decimal arithmetic for money and quantity. This is the root of finding R-04 and of the golden value for `commercial.priceVariation`.

## Registry

| Formula | Implementation | Golden case | Recorded output |
|---|---|---|---|
| `mobilisationAdvanceRecovery` | `src/domain/commercial.ts:16` | `commercial.mobilisationAdvanceRecovery` | 250 |
| `securedAdvanceLimit` | `src/domain/commercial.ts:35` | `commercial.securedAdvanceLimit` | 3750 |
| `securedAdvanceRecovery` | `src/domain/commercial.ts:50` | `commercial.securedAdvanceRecovery` | 1000 |
| `retentionDeduction` | `src/domain/commercial.ts:65` | `commercial.retentionDeduction` | 10 |
| `priceVariation` | `src/domain/commercial.ts:87` | `commercial.priceVariation` | 999.9999999999995 |
| `netDelay` | `src/domain/commercial.ts:103` | `commercial.netDelay` | 7 |
| `liquidatedDamages` | `src/domain/commercial.ts:110` | `commercial.liquidatedDamages` | 2000 |
| `earlyCompletionBonus` | `src/domain/commercial.ts:121` | `commercial.earlyCompletionBonus` | 4000 |
| `deviationSplit` | `src/domain/commercial.ts:131` | `commercial.deviationSplit` | {"withinBandQty":125,"excessAboveQty":5,"excessBelowQty":0} |
| `physicalProgress` | `src/domain/kpi.ts:8` | `kpi.physicalProgress` | 75 |
| `spi` | `src/domain/kpi.ts:15` | `kpi.spi` | 0.8 |
| `cpi` | `src/domain/kpi.ts:17` | `kpi.cpi` | 0.8 |
| `scheduleVariance` | `src/domain/kpi.ts:19` | `kpi.scheduleVariance` | -20 |
| `costVariance` | `src/domain/kpi.ts:21` | `kpi.costVariance` | 20 |
| `eacCpi` | `src/domain/kpi.ts:24` | `kpi.eacCpi` | 1250 |
| `etc` | `src/domain/kpi.ts:28` | `kpi.etc` | 1150 |
| `vac` | `src/domain/kpi.ts:30` | `kpi.vac` | -250 |
| `tcpi` | `src/domain/kpi.ts:32` | `kpi.tcpi` | 1.2 |
| `grossMargin` | `src/domain/kpi.ts:35` | `kpi.grossMargin` | 0.2 |
| `cvrMargin` | `src/domain/kpi.ts:43` | `kpi.cvrMargin` | 270 |
| `underOverBilling` | `src/domain/kpi.ts:59` | `kpi.underOverBilling` | 100 |
| `materialVariance` | `src/domain/kpi.ts:65` | `kpi.materialVariance` | 4 |
| `plantUtilisation` | `src/domain/kpi.ts:76` | `kpi.plantUtilisation` | 0.8333333333333334 |
| `plantAvailability` | `src/domain/kpi.ts:81` | `kpi.plantAvailability` | 0.9 |
| `mtbf` | `src/domain/kpi.ts:85` | `kpi.mtbf` | 250 |
| `mttr` | `src/domain/kpi.ts:87` | `kpi.mttr` | 5 |
| `labourProductivityIndex` | `src/domain/kpi.ts:90` | `kpi.labourProductivityIndex` | 0.8 |
| `dso` | `src/domain/kpi.ts:96` | `kpi.dso` | 27 |
| `dpo` | `src/domain/kpi.ts:99` | `kpi.dpo` | 12 |
| `certificationLagDays` | `src/domain/kpi.ts:103` | `kpi.certificationLagDays` | 14 |
| `workingDaysBetween` | `src/domain/kpi.ts:115` | `kpi.workingDaysBetween` | 6 |
| `rfiTurnaroundDays` | `src/domain/kpi.ts:130` | `kpi.rfiTurnaroundDays` | 5 |
| `ltifr` | `src/domain/kpi.ts:134` | `kpi.ltifr` | 4 |
| `trifr` | `src/domain/kpi.ts:137` | `kpi.trifr` | 5 |
| `firstTimeInspectionPass` | `src/domain/kpi.ts:141` | `kpi.firstTimeInspectionPass` | 0.9 |
| `costOfQuality` | `src/domain/kpi.ts:145` | `kpi.costOfQuality` | 100 |
| `vendorOtif` | `src/domain/kpi.ts:149` | `kpi.vendorOtif` | 0.8 |
| `procurementCycleDays` | `src/domain/kpi.ts:153` | `kpi.procurementCycleDays` | 10 |
| `formworkWearPerUse` | `src/domain/norms.ts:32` | `norms.formworkWearPerUse` | 0.01 |
| `unitWeightKgPerM` | `src/domain/reinforcement.ts:13` | `reinforcement.unitWeightKgPerM` | 1.5782983970406905 |
| `cutLengthMm` | `src/domain/reinforcement.ts:22` | `reinforcement.cutLengthMm` | 1176 |
| `barWeightKg` | `src/domain/reinforcement.ts:41` | `reinforcement.barWeightKg` | 0.8877928483353885 |


## Other computations in the repository (not business values)
- Program invariants and lookups (`src/program/`): part keys, phase lookup, dependency closure, start modes. These are program governance, not business values, and are recorded as golden cases under `program.*` and `legacy.*`.
- Shell arithmetic: none.
- Token generation (`scripts/build-tokens.mjs`): colour and layout values are copied from JSON, not computed.

## Known issues
- **Float money (R-04):** every money-returning formula uses `number`. The one golden value that shows it is `commercial.priceVariation` (999.9999999999995, expected 1000).
- **Keyword scan false positives:** 2 of 14 scan candidates are text in glossary and structure seeds, not arithmetic.
- **Interpretation (not in the annex):** `norms.formworkWearPerUse` (1 ÷ repetitions) is labelled as an interpretation in the code.
