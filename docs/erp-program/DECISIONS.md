# DECISIONS

Decision log for the program (§11). Each entry: ID · date · decision · reason · status. Owner signatures are not supplied by the agent.

| ID | Date | Decision | Reason | Status |
|---|---|---|---|---|
| D-001 | 2026-10-19 | Adopt Part 00 (Program Constitution) in this repository as `PROGRAM_RULES.md`. | §14 step 5. Adoption is complete except for the owner's signature. | ADOPTED — owner signature pending. Part 00 is not APPROVED until signed. |
| D-002 | 2026-10-19 | Application stack: Next.js 15 (App Router), React 19, TypeScript, ESLint, Vitest, tsx. | Chosen by the owner for the new project. AC-3 requires an approved ADR for any stack choice. | Interim. ADR-001 (Part 02) must record it. |
| D-003 | 2026-10-19 | The earlier spec pack (`docs/`, `design/`) and the starter assets were removed in the first build turn. The design token file was restored from git history later for Annex A. | Owner instruction ("delete earlier building code"). | Recorded as conflict CF-002. |
| D-004 | 2026-10-19 | Annex sources live in `docs/erp-program/annexes/`, not `docs/program/`. | §11 makes `docs/erp-program/` the single program documentation root. | Adopted. |
| D-005 | 2026-10-19 | Annex A: tokens are generated from `design/design-tokens.json` into `src/design/tokens.css`. The icon registry is TypeScript (`src/design/icons.tsx`), not JSON. The navigation registry is JSON. | Type-checked icon keys. The annex's `icon-registry.json` and `dashboard-reference.html` are not present. | Deviation noted; owner may ask for the JSON form. |
| D-006 | 2026-10-19 | The §1.3 identifier conventions are implemented as validators in `src/program/conventions.ts`. | Reference for the CI rule. | CI enforcement is owned by Part 04. |
| D-007 | 2026-10-19 | Annex C, D and E are parsed by generators into `src/program/*.generated.json`. Any malformed row fails the build. | Stops the machine-readable copy drifting from the annex. | Adopted. |
| D-008 | 2026-10-19 | CI rules owned by Part 04 (§14 step 4): no business arithmetic outside Part 22; no direct provider or government calls outside their services; no fixtures in production builds. | Constitution §14 step 4. | Recorded. Not yet enforced. See CF-003 for the current breach. |
| D-009 | 2026-10-19 | `PROGRESS_REGISTER.csv` is seeded with each Part's default mode and start mode (VERIFY & EXTEND where Annex D2 lists the Part). All Parts except 00 are NOT_STARTED. | §14 step 3. | Adopted. Legacy evidence is recorded as absent (CF-001). |
| D-010 | 2026-10-19 | Part 01 is scoped to the repository. Database, API, UI, job, socket and report inventories return empty results, recorded as such, because no such artefacts exist. | No legacy system is present (CF-001). A missing system is not invented or scored. | Adopted. Owner may later point to the legacy system. |
| D-011 | 2026-10-19 | The golden baseline covers every exported domain formula (42), programme invariants and rendered prompts, with a test that enforces coverage. | These are the outputs that exist. Database and report baselines wait for Parts 03 and 76. | Adopted. |
| D-012 | 2026-10-19 | Tag `erp-baseline-v0` is created locally on the baseline commit and is not pushed. | CF-007: no approved branch and no production commit. | Pending owner approval to push. |
| D-013 | 2026-10-19 | Fitness scores apply only to components that exist. Absent systems are listed and not scored. N/A dimensions drop out of the total and the weights are renormalised. | The §7 rubric scores a component, not an absence. Scoring absence as 0 would misstate the evidence. | Adopted. |
| D-014 | 2026-10-19 | Part 02 is drafted with ADR-000 (accepted interim) and ADR-001 to ADR-011 (PROPOSED). No ADR is approved. | Part 02 depends on Part 01, which is unsigned (CF-011). Approval is the approvers' decision, not the agent's. | Pending approval by the listed approvers in each ADR. |
| D-015 | 2026-10-19 | A CI workflow (`.github/workflows/ci.yml`) runs the quality gates on push and pull request. Design contrast and the production audit run as non-blocking jobs (CF-014). | Part 02 REQ-ARCH-F17 requires boundary lint in CI. Blocking on known failures would stop every build. | Adopted. |
| D-016 | 2026-10-19 | Node.js is pinned to 22 by `.nvmrc` and the `engines` field (`>=22 <23`). | R-09 (Node version not pinned). Node 22 is the LTS line in the radar. | Adopted. |
| D-017 | 2026-10-19 | The dependency allow-list (`docs/erp-program/DEPENDENCY_ALLOWLIST.json`) names each package and its source ADR. Adding a package requires an ADR, enforced by `npm run arch:check` (CP-ARCH-01). | Part 02 CP-ARCH-01. | Adopted. |
| D-018 | 2026-10-19 | The local application is verified at http://localhost:3000 and documented in `LOCALHOST.md`. No database or authentication is added. | Those belong to Parts 03 and 08A, which have not started (CF-011). | Adopted. |

