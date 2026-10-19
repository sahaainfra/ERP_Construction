# CHANGELOG

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
