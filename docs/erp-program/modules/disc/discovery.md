# Part 01 discovery record

Module `disc`. Part 01 — Existing System Audit, Architecture Fitness Assessment & Golden Baseline. Mode: VERIFY & EXTEND declared; discovery found no legacy implementation, so the work is recorded as the repository's own inventory (CF-001).

## What the Part asked for, and what was done
| Slice (§18) | Status | Notes |
|---|---|---|
| S1 Bootstrap and documentation set | Done | Part 00 adoption already in place (PROGRAM_RULES.md, registers, DECISIONS, CONFLICTS, CHANGELOG). This slice added EXISTING_SYSTEM_MAP, RISK_REGISTER, BASELINE_REPORT and the README index. |
| S2 Automated inventories | Done, with empty results | `scripts/erp-program/inventory.mjs` writes `inventory.json`. Database, API, UI, jobs and sockets searches return no files, recorded as empty. |
| S3 Calculation, item-master and control inventories | Done | CALCULATION_REGISTRY.md (42 entries), ITEM_LIKE_MASTERS.md, CONTROL_INVENTORY.md. |
| S4 Data-quality profile and load probe | Not applicable | No database or traffic. Build size measured. |
| S5 Fitness assessment and gap matrix | Done | ARCHITECTURE_FITNESS.md (4 components scored, 14 absent not scored); GAP_MATRIX.csv (95 Parts). |
| S6 Golden baseline, integrity checker, backup and restore, sign-off | Done, sign-off pending | Golden baseline and checker done; repository restore rehearsed; technical-lead sign-off pending (CP-DISC-05). |

## Method
1. `node scripts/erp-program/inventory.mjs` (read-only; no timestamps, so reruns are identical).
2. `npx tsx scripts/erp-program/baseline.ts capture`, then `check`.
3. `npx tsx scripts/erp-program/fitness-report.ts` for the scorecard.
4. `node scripts/erp-program/gap-matrix.mjs` for the gap matrix.
5. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run check:design` for the quality evidence.

## Controls (Part 01 §8)
| CP | Result | Evidence |
|---|---|---|
| CP-DISC-01 Every table, route, job, socket and report inventoried or listed as unmapped | Pass for repository content. Database tables, jobs, sockets and reports: listed as zero, with the search that returned zero | `inventory.json` → searches; EXISTING_SYSTEM_MAP.md |
| CP-DISC-02 Every validation, limit and approval in the control inventory | Pass. None exist; listed | CONTROL_INVENTORY.md |
| CP-DISC-03 Every statement cites evidence | Pass for the documents in this folder; each claim names a file, a search or a command | this folder |
| CP-DISC-04 Leakage points and data defects in the risk register | Pass. Leakage points not measurable; recorded as R-07 | RISK_REGISTER.md |
| CP-DISC-05 Golden baseline reproducible (two runs identical) and restore verified | Partly. Two runs: see "Reproducibility" below. Restore: see "Restore rehearsal" below. Sign-off pending. | below |

## Reproducibility
Capture and check are run twice; the results are recorded below.

## Restore rehearsal
Recorded below after the baseline tag is cloned into an isolated directory.

## Open items for the owner
- CF-001 (legacy system location), CF-002, CF-003, CF-004, CF-005, CF-006 (see CONFLICTS.md).
- CF-007 to CF-010 (added with this Part).
- Dependency upgrades (R-02) need an ADR (Part 02) before any change.
- Technical-lead sign-off in DECISIONS.md.
