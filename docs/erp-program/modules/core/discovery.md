# Part 05 discovery and delivery record

Module `core`. Part 05 — Shared Kernel & Core Platform Services. Status: **APPROVED by the owner 2026-10-19 (D-037)**. Dependencies Parts 02, 03 and 04 are approved. Deferred items CF-027 (Redis, object storage) and CF-028 (service hook decorator, storage abstraction, reference module, frontend helpers, developer guide, calendar API) stay open and are not delivered.

## Discovery (REQ-CORE-F01 input)
- Searched for an existing request context, unit of work, idempotency, numbering, settings, job queue, health and calendar code. The Part 01 inventory found none with these names in the repository.
- Decision: build the shared kernel fresh on the Part 03 database. Audit, ledger and protocol evaluation use interim adapter tables behind one unit-of-work interface (D-034).

## Delivery against the requirements
See `traceability.csv` in this folder. Status by requirement: 7 done, 6 partial, 5 deferred — the delivered set is the migration, `src/core/`, the two health routes and 39 tests (17 database, 22 pure).

## Verification
- `npx vitest run`: 273 tests pass, including the Part 05 database tests against a real PostgreSQL 16 database.
- Coverage of `src/core`: 91.9% lines (scope added to `vitest.config.mts`).
- Production build and both health routes checked on `next start`; readiness returns 503 when the database is unreachable.
