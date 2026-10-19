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
