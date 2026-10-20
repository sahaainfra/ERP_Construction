# CHANGELOG

## 2026-10-19 — Owner approvals: contrast, decimal money (D-040)
- CF-004: darkened `brand.accent` and `status.warning.solid` for the light and high-contrast themes. `npm run check:design` passes.
- CF-009: commercial money formulas use decimal.js 10.6.0 (ADR-004), rounded to paise at output. `commercial.priceVariation` golden changes from 999.9999999999995 to 1000 (re-captured; N4 change). Quantities are unchanged.
- CF-005, CF-006, CF-012, CF-013, CF-016 remain open: each needs the named input.

## 2026-10-20 — Part 07 slice S3 (D-049)
- Added migration `202610191800_iam_sod`: SoD rules, action log, actor links, exceptions, findings.
- Added `src/iam/sod.ts`: sixteen seed rules, preventive check under a record lock, observe and enforce modes, exceptions (90 days max), detective scan, findings.
- Added `check:all` preflight for the test database. Assumptions A-15 and A-16.

## 2026-10-20 — Part 07 slice S2 approval (D-048)
- Owner approved slice S2. Slices S1, S3–S5, the independent review, and the system roles remain open.

## 2026-10-20 — Part 07 slice S2 (D-047)
- Added migration `202610191700_iam_permissions`: permission registry, roles, role grants, scoped assignments, authority limits, field policies.
- Added `src/iam/`: the policy decision point `can()`, data-scope builder, field masks, maker-checker for grants and assignments, authority limits.
- 33 tests (12 pure, 21 database). No authentication yet; no route exposed. Assumptions A-13 and A-14.

## 2026-10-20 — Part 06 slices S3–S5 (D-046)
- Added migration `202610191600_org_lbs_geofence_allocation`: locations, geofence versions, allocations, user contexts.
- Added LBS (`lbs.ts`), geofences and punch checks (`geofence.ts`, `geo.ts`), allocations and context data (`allocations.ts`), closure checklist (`closure.ts`). Activation and closure gates now use the real checks.
- Assumptions A-11 and A-12. Owner approval recorded as D-046 for the built scope.

## 2026-10-20 — Part 06 slice S2 approval (D-045)
- Owner approved slice S2. Slices S3–S5, the independent review, and routes and screens remain open.

## 2026-10-20 — Part 06 slice S2 (D-044)
- Added migration `202610191500_org_projects_sites`: projects, sites, status history (append-only), templates; cost centres link to projects.
- Added `src/org/projects.ts`: project and site creation, lifecycle gates with exception path, read-only archive, templates applied once.
- 39 new tests. Assumptions A-08 to A-10 recorded.

## 2026-10-20 — Part 06 approval (D-043)
- Owner approved Part 06 for slice S1. Slices S2–S5, routes and screens, and the independent review remain open.

## 2026-10-19 — Part 06 slice S1 (D-042)
- Added migration `202610191400_org_structure`: legal entities and registrations, hierarchy units with history, cost and profit centres. RLS on every table; no delete right for the application role.
- Added `src/org/`: validation (PAN, GSTIN check character and consistency, state codes, coordinates, dates) and services (create, approve with maker-checker, register, reparent with cycle check and history, deactivate, centres).
- 37 tests (11 pure, 26 database). Plan, phases and reporting format in `modules/org/discovery.md`.
- Not built: slices S2–S5, routes and screens (need Part 07).

## 2026-10-19 — Part 05 remaining code (D-041)
- Added `hooks.ts` (controlled-method declarations; authorisation and protocol check required), `client.ts` (headers, idempotency keys, permission check, error messages, scope store), `storage.ts` (local adapter with allow-listed keys and SHA-256 check), `sample.ts` (reference module behind `ff.core.sample`, off everywhere), `error-docs.ts` (generates `ERROR_CODES.md`).
- Added `modules/core/DEV_GUIDE.md`. Updated `traceability.csv` and CF-028.
- Changed the flag-registry test: the registry holds only `ff.core.sample`, off in every environment.
- 298 tests pass; core coverage 96.8% lines.

## 2026-10-19 — Part 05 shared kernel (in progress; Part 04 not yet approved)
- Added migration `202610191300_core_shared_kernel` (settings, number series and allocations, interim audit, ledger and evaluation tables, jobs, holidays, financial periods, reference table), with row-level security on every table.
- Added `src/core/`: request context, error envelope and catalogue, logger, feature flags, calendar rules, i18n formatting, unit of work, numbering, settings with maker-checker, idempotency wrapper, job queue, rate limiter and cache.
- Added `GET /health/live` and `GET /health/ready`. Readiness reports only the database as checked.
- Added 39 tests (17 database, 22 pure). Coverage of `src/core` 91.9% lines. Secret-scan allowlist extended with reviewed fixture entries.
- Deferred: CF-027 (Redis, object storage) and CF-028 (service hook decorator, storage, reference module, frontend helpers, developer guide, calendar API).

## 2026-10-19 — Program adoption (Part 00)
- Adopted the constitution as `PROGRAM_RULES.md` (D-001, pending owner signature).
- Annex sources moved to `docs/erp-program/annexes/`.
- Generated machine-readable data from Annexes C, D and E (`src/program/`).
- Wrote `LEGACY_CROSSWALK.csv`, `PROGRESS_REGISTER.csv`, `LEGACY_MAPPING.md`, `DECISIONS.md` and `CONFLICTS.md`.
- Implemented the §1.3 identifier validators (`src/program/conventions.ts`).
- Recorded six conflicts for owner decision (CF-001 to CF-006).
- Built the Next.js app shell, design system (Annex A) and domain reference modules (Annex B) in earlier commits on this branch.

## 2026-10-19 — Part 01 discovery and golden baseline
- Read-only inventory of the repository (`scripts/erp-program/inventory.mjs`); deterministic output.
- Fitness scorecard for four components (`src/program/fitness.ts`); absent systems listed, not scored.
- Calculation registry (42 entries), item-like masters, control inventory, dependency map, communication inventory, existing-system map.
- Golden baseline: 54 cases, 20 artefact hashes; classifier separates destructive from additive changes (`npm run baseline:check`).
- Gap matrix for all 95 Parts (`GAP_MATRIX.csv`) and risk register (10 risks).
- Ten conflicts and four decisions recorded (CF-007 to CF-010, D-010 to D-013).
- Dependency advisories recorded (R-02) and not fixed, per Part 01 scope.

## 2026-10-19 — Part 02 architecture (drafted)
- Architecture views (`ARCHITECTURE.md`): context, container, component, data flow, trust boundaries, current-to-target table, replacement roadmap.
- ADR-000 (accepted, interim) and ADR-001 to ADR-011 (PROPOSED), each with options, decision, fitness function and rollback.
- Technology radar (`TECH_RADAR.md`) with versions verified against the npm registry, and build-versus-buy register.
- Environment blueprint (`ENVIRONMENTS.md`); infrastructure as code not written (CF-012).
- Architecture conformance gate (`npm run arch:check`): boundary rules and the dependency allow-list; 0 violations.
- CI workflow added; Node pinned to 22.
- Local application verified at http://localhost:3000 (`LOCALHOST.md`).

## 2026-10-19 — Part 03 database foundation (drafted and verified locally)
- Local PostgreSQL 16 cluster with least-privilege roles (`scripts/db/setup-local.sql`).
- Migrations `202610191200_dbf_sys_foundation` and `202610191230_dbf_sys_operations` (`sys` schema: register, idempotency, outbox, back-fill checkpoints, invariants, snapshots, findings, ACP, legacy loads, tenant context, RLS template, append-only guard, partitions, effective dating, masking).
- Migration runner with checksum guard, single-runner lock, dry run, down, status; migration linter (naming, module code, destructive statements, float money, NOT NULL without default).
- Transaction helper (isolation, timeouts, retries with jitter, tenant context), idempotency store, transactional outbox, keyset back-fill with per-batch reconciliation, integrity snapshots and invariants.
- Verified: 1,000,000-row back-fill with a forced stop and resume reconciles exactly; up, down, up keeps the schema fingerprint; dump and restore compare equal; RLS isolates tenants; masking refuses without a salt and keeps formats; health endpoint returns 200 and 503 without details.
- CI database job on PostgreSQL 16.
- Schema review with eight findings, each with a remedy (`modules/dbf/schema-review.md`).
- Conflicts CF-015 to CF-018; decisions D-019 to D-024.
- Dev database re-initialised by the runner (D-023).


## 2026-10-19 — Part 04 quality engineering and CI/CD (drafted and verified locally)
- Test stack: Vitest with coverage floors (96.4 % lines measured), Playwright end-to-end at 360, 820 and 1440 px (18 tests), axe accessibility (zero violations; a known-bad page is rejected).
- Gate configuration (`quality-gates.json`), threshold and quarantine rules, release state machine, environment and feature-flag validation, audit assembly, traceability roll-up, secret scan with a reviewed allowlist.
- Contract diff with known-bad fixtures; health endpoint contract checked against the real route.
- Deterministic volume generator; 1,000,000-row digest matches. Performance smoke for health (p95 within budget).
- CI: quality, database, runtime (browser and performance against the production build) and SBOM jobs; design gate and production audit remain non-blocking.
- Conflicts CF-020 to CF-025; decisions D-028 to D-032.
