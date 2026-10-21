# Part 15 — Existing application redesign and screen migration: discovery, plan and execution prompt

Status: **discovery and plan only. No code.** Part 15 is not yet approved by the owner (Part 00 §1.2). Build waits for that approval. Risk is Medium, so no independent reviewer is mandatory under §5.8, but the parity sign-off in REQ-UXMIG-F08 and CP-UXMIG-01 is.

Dependencies (Part 00 §1.2): Part 01 (approved), Part 12 (approved for S1 to S3, D-072; S4 and S5 open), Part 13 (approved, D-079), Part 14 (approved, D-091; independent review outstanding). All four are approved, with the open items listed in §2.

**Blocking finding.** Part 15 migrates the screens of the live ERP. This repository holds **one route** (`/`), no legacy screens and no API route handlers (EXISTING_SYSTEM_MAP.md, Part 01). The inventory in REQ-UXMIG-F01 cannot be produced from this repository, so S1 cannot start on real screens. The plan in §4 separates what can be built here now from what needs the screen source.

## 1. Discovery summary

| Area | Present | Where | Gap against Part 15 |
|---|---|---|---|
| Live ERP screens | None in this repository. One route, `/` | `src/app/page.tsx`; EXISTING_SYSTEM_MAP.md | **Blocking.** The screen inventory (REQ-UXMIG-F01) and every wave need the source (§2.1) |
| Legacy build evidence | Old Prompts 03 to 10 are marked `legacy_built = yes` in LEGACY_CROSSWALK.csv, but no screen code for them is here | `docs/erp-program/LEGACY_CROSSWALK.csv` | "Verify only" (§13) cannot be checked against code in this repository |
| Target templates | Launchpad, ListReport, ObjectPage, Wizard, SettingsPage, PublicAuthPage, Worklist, Overview, MobileCapture, all with states | `src/design/ui/templates.tsx`, `states.tsx`, `core.tsx`, `frames.tsx` | None for the templates themselves. Accessibility is checked per template (315 cases, Part 12 and 14) |
| Tokens and literal rule | Tokens in `tokens.css`; hard-coded colour rule in `literals.ts`; contrast in `contrast.ts`; `check:design` gate | `src/design/` | Legacy screens would need the same rule; none exist here to check |
| Navigation, launchpad and search registries | Present | `src/design/navigation.ts`, `navigation-access.ts`, `src/dash/registry.ts`, `src/search/` | Migrated screens must register (REQ-UXMIG-F10); no live screens to register yet |
| Feature flags | **None at runtime.** Only a naming convention (`ff.<module>.<feature>`) in `src/program/conventions.ts` | `src/program/conventions.test.ts` | `ff.uxmig.<module>` needs a flag store, defaults and audit (REQ-UXMIG-F09) |
| Redirects for old URLs | None. No legacy routes exist here | — | Registry needed (REQ-UXMIG-F09) |
| Golden outputs | Part 01 baseline (`GOLDEN_OUTPUTS/baseline.json`) and `baseline:check` gate | `docs/erp-program/GOLDEN_OUTPUTS/` | Covers this repository's outputs only. Live ERP golden outputs are not here |
| Telemetry | Part 09 metrics, logger and correlation exist | `src/obs/` | No live usage data (sessions per week, device mix, error rate, task time). The KPI baseline (CP-UXMIG-04) cannot be set |
| Session and roles | None (A-87) | — | Role-based parity (actions per role, REQ-UXMIG-F08) and pilot by role cannot run without the session layer |
| Duplicate components | Three component areas (`src/components/shell`, `src/design/ui`, `src/design`); no duplicates found in the Part 12 and 14 code | — | The duplicate scan (REQ-UXMIG-F04) can run now, against this repository |

## 2. Decisions needed from the owner (minimum)

1. **Source of the live ERP screens (blocking).** Options: (a) the repository or repositories that hold the live application, added read-only with `add_repo`, so the inventory can be taken from code (**recommended**); (b) a screen export from the live system: route list, component list, one screenshot per screen and the role that sees it; (c) confirm that no legacy screens exist and that Part 15 applies only to screens built after this point, in which case S1 to S5 are a no-op and this Part closes after the framework (S1 framework only). Owner decides.
2. **Golden outputs for the live application.** Parity needs the live system's outputs (totals, exports, prints) for fixed inputs. Options: (a) the live system produces them from a test dataset (**recommended**); (b) the owning Part's golden outputs are used where they exist. Owner names the source per module.
3. **Usage telemetry.** The wave order (REQ-UXMIG-F02) and the KPI baseline need sessions per week, device mix and task time per screen. Options: (a) an export from the live system's analytics; (b) start the baseline at pilot. Owner decides.
4. **Module product owners and go/no-go approvers** for each wave (REQ-UXMIG-F02, CP-UXMIG-01 escalation L2). Names are needed; this plan does not assume them.
5. **Pilot groups** by role and site for each wave (REQ-UXMIG-F09). Names and sites needed.
6. **Who approves legacy retirement** (CP-UXMIG-02, REQ-UXMIG-F12). Recommended: the product owner named in §2.4, with the UX lead's sign-off.
7. **Field-critical wave** (REQ-UXMIG-F14). Confirm that DPR, attendance, material request and issue, GRN, approvals, inspections and tasks exist in the live system, and whether they use the same screen set as Part 14.

## 3. Assumptions proposed for Part 15

Proposals, recorded in `ASSUMPTIONS.md` only when the owner approves Part 15. Numbering starts at A-137, the next free id.

- **A-137 Scope of this build.** The framework is built in this repository: the screen scanner and classifier, the tracker, the feature-flag store, the redirect registry, the parity harness, and the duplicate-component report. Screen migration runs once screens are supplied (§2.1).
- **A-138 Feature flags.** `ff.uxmig.<module>` values are stored per tenant on the server, default off, changed only by an administrator and written to the audit log. A client-side flag is not used for access decisions. The flag store is a server table, so it waits for the session layer for enforcement; until then flags are read from configuration in a single place.
- **A-139 Parity comparison.** Data is compared for identical filters. Calculations and totals are compared with golden outputs. Exports are compared byte for byte where the format is deterministic (CSV, XLSX with fixed metadata) and semantically where it is not (PDF text and structure). Message text may change only under DS-28, with the meaning unchanged, and the change is listed for the product owner.
- **A-140 Redirects.** Every legacy route maps to its new route through one registry. A known legacy route never returns 404 while the flag is in place. Redirects are tested in CI.
- **A-141 Tracker.** The tracker is a generated CSV in the repository, produced by a script from the screen scanner's output and the parity results. The Technical Console shows it read-only. The optional `uxmig_screens` table is deferred until the session layer exists; no database change is made in this Part.
- **A-142 Duplicate scan.** Uses the TypeScript compiler API already present as a development dependency. No new package is added. It reports local variants of library components by name and by structure.
- **A-143 "What's new" tips.** Stored as a user preference (dismissed or not) once the session layer exists. Until then no tip is shown, rather than shown to everyone every time.
- **A-144 KPI baseline.** Post-migration KPIs are compared with the legacy baseline from telemetry. Without a baseline, the screen is marked "no baseline" and cannot be used as proof of improvement.

## 4. Execution phases, deliverables and gates

**Phase 1 — S1 Inventory, classification and wave plan.** Built now, against this repository: screen scanner (route, components, data sources, actions, roles where the code states them), classification into verify only, restyle, refactor to template or rebuild (REQ-UXMIG-F01); duplicate-component report (REQ-UXMIG-F04); tracker generator (REQ-UXMIG-F13); feature-flag store and redirect registry (REQ-UXMIG-F09, A-138, A-140); parity harness skeleton with golden comparison and a fixture for the current `/` route (REQ-UXMIG-F08). The inventory content and wave plan need §2.1 and §2.4 answers.
Gates: `check:all` 9 of 9; the scanner and duplicate report run in CI; a redirect test and a flag test; the parity harness passes on `/`.

**Phase 2 — S2 Field-critical wave.** Migrates DPR, attendance, material request and issue, GRN, approvals, inspections and tasks with the Part 14 patterns (REQ-UXMIG-F14), each behind its flag. Needs §2.1, §2.2, §2.5 and the session layer for role parity.
Gates: `check:all`; axe clean and visual checks at 360, 820 and 1440 in light and dark (CP-UXMIG-03); parity report per screen (CP-UXMIG-01); a pilot week with no increase in error rate (CP-UXMIG-04).

**Phase 3 — S3 Commercial, procurement and stores wave.** Same gates as Phase 2.

**Phase 4 — S4 Finance, HR and administration wave.** Same gates as Phase 2. Financial screens need golden outputs for every total (§2.2).

**Phase 5 — S5 Remaining screens, retirement and final consolidation.** Legacy retirement only after acceptance, one release with zero use in telemetry, and the approval in §2.6 (CP-UXMIG-02). Release notes list each deletion. Duplicate report shows zero local variants for migrated modules.

**Standing rule for every phase.** Each phase is built, verified and reported on its own. A wave does not start until the previous wave is accepted. A flag is turned on for pilot groups only after its parity report is accepted.

## 5. Reporting format (required for every phase)

1. **Phase and slice:** for example `Part 15 · S1`.
2. **Outcome:** one line: built, partly built, blocked, or planned only.
3. **Deliverables:** each with its file or route path and requirement id (REQ-UXMIG-Fxx or CP-UXMIG-xx).
4. **Assumptions and decisions:** new assumption ids (A-145 onward after this plan) and decision ids (D-xxx). Nothing is recorded as approved unless the owner approved it.
5. **Evidence:** the exact command and result for each gate: `npm run check:all` (x of 9), the named tests, the parity report per screen, axe results at each width and theme, and redirect results.
6. **Screens:** count inventoried, classified, migrated, parity-proven, piloted, accepted, and retired. Each count is from the tracker, not from memory.
7. **Not built and why:** each item from the phase plan that is not done, with the reason.
8. **Owner items:** each question that needs the owner, with the minimum information needed to answer it.
9. **Next step:** the next phase, and whether it needs approval first.

## 6. Enhanced execution prompt for Part 15

Use the Part 15 specification and this discovery. Start from §2: do not build screen migration until §2.1 is answered. In this order:

1. Confirm §2.1. If the answer is (a), add the repository read-only with `add_repo` and inventory it. If (b), ingest the export. If (c), record the no-op and stop after the framework.
2. Build the Phase 1 framework (§4) with tests, run `check:all` on the staged tree, and report in the format of §5.
3. Do not migrate a screen, change a route, or turn on a flag, until its parity report is accepted and the owner has approved the wave.
4. Keep the live application's data and behaviour unchanged. Any desired functional change is a separate requirement for the owning Part.
5. Stop and report at each approval point. Ask only for what §2 names.

## 7. S2 target-template proposal (assumptions only, no screens inspected)

Proposed before the screen export arrives, so the S2 wave can start quickly once it does. Each mapping is an assumption (A-145) to confirm against the real screens. Where a real screen differs, the screen's behaviour wins and this table changes.

| Field-critical screen | Assumed role | Assumed template | Part 14 patterns | Assumed classification |
|---|---|---|---|---|
| DPR (daily progress report) | Site engineer | ObjectPage (record) with MobileCapture for entry | CardList, QuantityField, MasterDetail on tablet | refactor to template |
| Attendance (punch and daily register) | Time keeper | ListReport | CardList, FilterChips | refactor to template |
| Material request and issue | Site engineer, store keeper | Wizard for new requests, ObjectPage for records | QuantityField, sticky primary action | refactor to template |
| GRN (goods receipt) | Store keeper | Wizard | QuantityField, BarcodeCapture with manual fallback | refactor to template |
| Approvals | Approver | Worklist | CardList, ApprovalPanel | restyle |
| Inspections | QA/QC | ObjectPage with checklist | MasterDetail, SignaturePad, CameraCapture | refactor to template |
| Tasks | Supervisor | Worklist | CardList, FilterChips | restyle |

Assumptions for this table:
- **A-145 Target mapping.** Each field-critical screen moves to the template above, using the Part 14 field components already built and tested (`src/design/ui/field.tsx`). A screen whose real structure differs keeps its behaviour and is re-mapped after the export is read.
- The roles listed are the Part 14 field roles (`FIELD_ROLES` in `src/field/logic.ts`). They are assumed, not confirmed by the live system (§2.7).
- Approvals with financial impact stay online-only (A-135), so their migrated screen must not offer offline submission.

Status: proposal only. Owner confirmation is needed before the S2 build uses it.
