# CHANGELOG

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

