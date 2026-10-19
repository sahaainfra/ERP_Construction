# BASELINE_REPORT

Part 01 §12. Baseline for `sahaainfra/ERP_Construction` at the commit tagged `erp-baseline-v0`.

## Stack summary
Next.js 15.5.28 (App Router), React 19.1.0, TypeScript 5.9.3, Vitest 3.2.7, tsx 4.23.15, ESLint 9.39.5. No database, no authentication, no API, no real-time, no queue, no CI. Details in EXISTING_SYSTEM_MAP.md.

## Figures
| Measure | Value | Source |
|---|---|---|
| Database tables | 0 | No database |
| Total rows | 0 | No database |
| Reports | 0 | None generated |
| Routes | 1 | `inventory.json` → appRoutes |
| API route handlers | 0 | `inventory.json` → apiRouteHandlers |
| Tracked files | 66 before this Part's files | `inventory.json` → trackedFiles |
| Exported domain and programme symbols | 91 | `inventory.json` → exportedSymbols |
| Calculation registry entries | 42 | CALCULATION_REGISTRY.md |
| Golden cases | 54 | `GOLDEN_OUTPUTS/baseline.json` |
| Artefacts hashed | 20 | `GOLDEN_OUTPUTS/baseline.json` |
| Tests | 132 pass, 0 fail | `npm test` |
| Lint | clean | `npm run lint` |
| Typecheck | clean | `npx tsc --noEmit` |
| First-load JavaScript, `/` | 103 kB shared; 123 B route | `npm run build` |
| Design contrast pairings | 72 checked; 4 failing | `npm run check:design` |
| Dependency advisories, production | 2 (moderate 1, high 1) | `npm audit --omit=dev` |
| Dependency advisories, all | 10 (critical 2, high 6, moderate 2) | `npm audit` |
| Licences, all dependencies | MIT, ISC, Apache-2.0 | `inventory.json` → dependencies |
| Import cycles | 0 | `inventory.json` → importGraph |
| Secret-pattern matches | 0 | `inventory.json` → secretPatternMatches |
| Programme Parts | 95 in 15 phases | `src/program/parts.generated.json` |
| Gap coverage | adopted 1 · partial 4 · reference-only 16 · none 74 | GAP_MATRIX.csv |

## Fitness heat-map (scores 0–5; N/A = not applicable)
| Component | Func | Integ | Perf | Sec | Maint | Curr | Integ.&events | Obs | Weighted | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|
| Shell and design system | 2 | N/A | N/A | **0** | 3 | 2 | N/A | **0** | 1.50 | REFACTOR (REPLACE not justified) · Critical to Part 08 |
| Domain formula library | 3 | **0** | N/A | N/A | 4 | 5 | 1 | N/A | 2.23 | REPLACE-candidate (criterion 5) |
| Programme index and checks | 4 | 4 | N/A | N/A | 4 | 5 | N/A | N/A | 4.08 | KEEP / EXTEND |
| Token pipeline and gate | 4 | 3 | N/A | N/A | 4 | 5 | N/A | N/A | 3.75 | KEEP / EXTEND |

## Top risks (from RISK_REGISTER.md)
1. **R-03 Critical:** no authentication; the permission check is a stub.
2. **R-02 Critical (dev) / High (prod):** dependency advisories; fixes need major upgrades.
3. **R-01 High:** no legacy system in the repository; the legacy-built marks are unverified.
4. **R-04 High:** floating-point money (golden value 999.9999999999995 for an expected 1000).

## Baseline status
- Capture is reproducible: the baseline was captured, and `baseline:check` reports no destructive difference against it.
- Restore is rehearsed in an isolated checkout of the tag (see `modules/disc/discovery.md`).
- Not in the baseline: database, API, reports and screens (none exist; see RISK_REGISTER R-08).

## Sign-off
Technical lead: pending. Two runs identical: see `modules/disc/discovery.md`. CP-DISC-05 remains open until the technical lead signs.
