# CHANGELOG

## 2026-10-21 — Part 16 slice S3 built (D-101)
- Added working-day SLA timers with reminders and return at expiry, one-hop delegation, recall and admin reassignment, amendments with computed changes, and emergency approvals with regularisation. Migration 202610193200_wf_sla_delegation with rollback. Comments, holidays and escalation ladders wait for S4, the owner and Part 18.

## 2026-10-21 — Part 16 slice S2 approved (D-100)
- Owner approved Part 16 S2. S3 to S5 and the open owner decisions remain.

## 2026-10-21 — Part 16 slice S2 built (D-099)
- Added decision tables with coverage checks, cumulative evaluation and DR-13, approver resolution with SoD, simulation, maker-checker activation gated by simulation, and migration 202610193100_wf_rules. 21 new tests. Seed data and the engine's use of the resolver wait for the owner and the session layer.

## 2026-10-21 — Part 16 slice S1 approved (D-098)
- Owner approved Part 16 S1. S2 to S5 and the open owner decisions remain.

## 2026-10-21 — Part 16 slice S1 built (D-097)
- Added the workflow engine (state machine checks, submit, approve, reject, return, resubmit, cancel), the no-session rules, the read-only legacy mirror, migration 202610193000_wf_engine with rollback, and 23 tests. Recall, reassign, comment and the seed definitions are deferred.

## 2026-10-21 — Part 16 plan approved (D-096)
- Owner approved the Part 16 plan and assumptions A-146 to A-154. The §2 owner decisions are open, including Part 10 S1 approval and the session layer. S1 not started.

## 2026-10-21 — Part 15 slice S1 approved (D-094)
- Owner approved Part 15 S1. S2 to S5 wait for the live ERP screen source and the owner's answers in modules/uxmig/discovery.md §2.

## 2026-10-21 — Part 15 slice S1 built (D-093)
- Added the migration framework: scanner, classifier, duplicate report, tracker, feature flags, route registry, parity rules and the golden check on the home route. `npm run uxmig:scan`. 16 tests. The inventory covers one route until the live ERP screens are supplied.

## 2026-10-21 — Part 15 plan approved (D-092)
- Owner approved the Part 15 plan and assumptions A-137 to A-144. The §2 owner decisions are open; the live ERP screen source (§2.1) blocks the inventory. S1 not started.

## 2026-10-21 — Part 14 final approval recorded, independent review outstanding (D-091)
- The owner approved Part 14 finally. The independent human review required by Part 00 §5.8 is not done and is recorded as outstanding.

## 2026-10-21 — Part 14 slices S4 and S5 built and approved (D-087 to D-090)
- S4: sync pass, backoff, media upload against the test adapter, conflict framework and screen, status model. 19 sync tests; accessibility 315 of 315.
- S5: device binding and revocation rules, offline-capability registry with the online-only list, consent-gated redacted diagnostics. 12 tests.
- The owner approved S4 and S5 in the running session. Final approval of Part 14 waits for the independent human review (Part 00 §5.8). The server registry, production media storage, the online-only list confirmation and the reports remain open.

## 2026-10-21 — Part 14 slice S3 approved (D-086)
- Owner approved Part 14 S3. S4 and S5, the open owner decisions and the independent review remain open.

## 2026-10-21 — Part 14 slice S3 built (D-085)
- Added the encrypted vault, the command queue and stale-base rule, the freshness and scope rules, and the Ed25519 snapshot check, with 17 tests. The server endpoints, the IndexedDB adapter and key custody wait for the session layer and owner decisions. S3 approval pending the owner.

## 2026-10-21 — Part 14 slice S2 approved (D-084)
- Owner approved Part 14 S2. S3 to S5 and the independent human review remain open.

## 2026-10-21 — Part 14 slice S2 built (D-083)
- Added the web app manifest, icon, install prompt and update banner, the minimum-version rule (`versionPolicy`), the service worker (`public/sw.js`, cache policy A-126), the offline page, and the field PWA tests and browser checks.
- Gates 9 of 9. Accessibility 306 of 306. Browser checks for the manifest, worker and registration 9 of 9.
- Kiosk login, field home and push wait for the session layer or the owner's decision. S2 approval pending the owner.

## 2026-10-21 — Part 14 slice S1 approved (D-082)
- Owner approved Part 14 S1. S2 to S5 and the independent human review remain open.

## 2026-10-21 — Part 14 slice S1 (D-081)
- Added `src/field/logic.ts` (shell slots, compression, GPS, watermark, capture fallbacks, scan parsing, signature paths) and `src/design/ui/field.tsx` (field components). Accessibility: 297 of 297 at three widths and three themes.

## 2026-10-21 — Part 14 plan approved (D-080)
- Owner approved the Part 14 plan. Assumptions A-113 to A-122 recorded. The §2 decisions remain open, and the independent human review (Part 00 §5.8) is still required. No slice is built yet.

## 2026-10-21 — Part 13 approved for slices S1 to S5 (D-079)
- Owner approved Part 13 for the slices built. Screens, the open §2 decisions and volume measurement remain open.

## 2026-10-21 — Part 13 slice S5 (D-078)
- Added `src/dash/timeline.ts`: record and project timelines read from the audit chain, with restricted activity for other people's changes.
 
## 2026-10-21 — Part 13 slice S4 (D-077)
- Added `src/dash/drill.ts` (drill registry, conformance, breadcrumb, where-used) and the breadcrumb component. A where-used count that ran outside the tenant transaction was found and fixed before commit.

## 2026-10-21 — Part 13 slice S3 (D-076)
- Added migration `202610192800_srch_search` and `src/search/` (index, query service, usage, command actions). Search p95 measured at 21.7 ms on 20,000 rows (extrapolation only; A-111).
 
## 2026-10-21 — Part 13 slice S2 (D-075)
- Added `src/dash/designer.ts` (propose, maker-checker publish with event, persona preview) and `src/dash/filters.ts` (URL filters, allocation checks).
- Added frames to `src/design/ui/frames.tsx`: Project 360, site, department, control tower. Accessibility cases added (87 passed at desktop width).

## 2026-10-20 — Part 13 slice S1 (D-074)
- Added `src/dash/`: widget contract, registry, runtime (parallel, isolated, timed), three widgets with real data, and spaces (personal, role, default).
- Added migration `202610192700_dash_spaces`. Screens and routes wait for the session layer.

## 2026-10-20 — Part 13 approved (D-073)
- Owner approved Part 13 for the phases in the discovery plan. Assumptions A-93 to A-101 recorded. The §2 decisions remain open, including the session-layer question for screens. No slice is built yet.

## 2026-10-20 — Part 12 approved for slices S1 to S3 (D-072)
- Owner approved Part 12 for the slices built (S1 to S3). S4 and S5 and the open decisions remain.

## 2026-10-20 — Review of Parts 00 to 12 (D-071)
- Fixed the foundation down script (missing `sys.mask_bytes` drop) and added a rollback rehearsal test.
- User provisioning writes the credential inside its transaction (orphan-credential fix; test added).
- Hash masking is keyed with `MASKING_KEY` (A-91). Unused import removed.
- Playwright pinned to 1.55.1 (advisory fix, A-92).

## 2026-10-20 — Part 12 slice S3 (D-070)
- Added `src/design/ui/` (states, core components, templates) and token-only styles in `globals.css`.
- Added `e2e/design-templates.spec.ts` and `e2e/fixtures/`: 24 cases × 3 themes checked with axe in Chromium (72 of 72 passed).

## 2026-10-20 — Part 12 slice S2 (D-069)
- Navigation filtered by permission (`src/design/navigation.ts`, server check in `navigation-access.ts`). Bottom bar for narrow screens; pinned entries in the side navigation.
- Icon rule: no direct icon-library import or icon-by-file outside the registry (unit test).
- Added migration `202610192600_ds_user_preferences` and `src/design/preferences-server.ts` (own-row preferences, validation).
- Shell elements that need later Parts (Create, inbox, notifications, help, user menu, launcher) are not rendered yet (A-86).

## 2026-10-20 — Part 12 slice S1 (D-068)
- Vendored UI fonts into `public/fonts` with OFL texts; `src/design/fonts.css`; the root layout no longer loads fonts from Google at build time.
- Token build also emits `src/design/tokens.ts`. Literal rule in `src/design/literals.ts` (unit test and design gate).
- Added migration `202610192500_ds_branding` and `src/design/branding.ts`: contrast-checked, maker-checker brand versions (light theme, A-83).
- Pre-paint script accepts only known theme and density values.

## 2026-10-20 — Part 12 approved (D-067)
- Owner approved Part 12 for the phases in the discovery plan. Assumptions A-72 to A-82 recorded. The plan's §2 decisions remain open, including Annex A, the library ADRs and the design owners. No slice is built yet.

## 2026-10-20 — Part 11 slice S1 (D-066)
- Added migration `202610192400_intg_connectors`: connectors, credential versions, mappings, messages, dead-letter queue (all tenant-scoped with RLS).
- Added `src/intg/`: SSRF-safe destination check, connector circuit breaker, guarded connector call, credential vault, versioned mappings, monitor view.
- `INTG_VAULT_KEY` added to `.env.example` and LOCALHOST.md. No live external call is made by any test.

## 2026-10-20 — Part 11 approved (D-065)
- Owner approved Part 11 for the phases in the discovery plan. Assumptions A-57 to A-68 recorded. The plan's §2 decisions remain open; no slice is built yet.

## 2026-10-20 — Part 10 slice S1 (D-064)
- Added migration `202610192300_evbus_envelope_inbox`: outbox envelope columns and the consumer inbox `evt_inbox`.
- Added `src/evbus/` (envelope, inbox, broker with PostgreSQL adapter, relay). `enqueueEvent` refuses sensitive values; `uow.emit` passes the correlation ids.
- Fixed (Part 09 defect): logger key redaction matched substrings (`companyId`, `span` were masked). Now matches whole words.

## 2026-10-20 — Part 10 approved (D-063)
- Owner approved Part 10 for the phases in the discovery plan. Assumptions A-46 to A-56 recorded. The plan's §2 decisions remain open; S1 proceeds on the documented assumptions for the broker and the real-time transport.

## 2026-10-20 — Part 09 slice S1 (D-062)
- Added `src/obs/`: value redaction (`redact.ts`), correlation scope (`correlation.ts`), W3C trace context and spans (`trace.ts`), in-process RED metrics (`metrics.ts`), route telemetry (`telemetry.ts`).
- `src/core/logger.ts` masks secret-like values in strings and adds the correlation and trace ids of the running work.
- `runRoute` in `src/iam/pipeline.ts` runs every route through `instrumentRoute`.
- No package added (CP-ARCH-01). A-36 and A-37 adapted; ADR pending owner.

## 2026-10-20 — Part 09 approved (D-061)
- Owner approved Part 09 for the phases in the discovery plan. Assumptions A-36 to A-44 recorded. No slice built yet. Open: CTO confirmation of SLO targets, CF-012, and the independent reviewer.

## 2026-10-20 — Part 08A slice S1 approved (D-060)
- Owner approved slice S1. Assumptions A-29 and A-31 to A-35 accepted; A-33 remains a known gap. Slices S2 to S6 and the independent review remain open.

## 2026-10-20 — Part 08A slice S1 (D-059)
- Added migration `202610192200_auth_users`: User ID series, users with account states and validity dates, password history (append-only).
- Added `src/auth/users.ts` (User IDs, admin-created users, state moves) and `src/auth/signin.ts` (sign-in gate, generic refusal, password change, sign-out).
- `buildContext` accepts a User ID as the session user as well as a UUID (A-34). `login` takes an optional account-state gate.
- Pending accounts may be suspended or deactivated by an administrator (A-35).

## 2026-10-19 — Owner approvals: contrast, decimal money (D-040)
- CF-004: darkened `brand.accent` and `status.warning.solid` for the light and high-contrast themes. `npm run check:design` passes.
- CF-009: commercial money formulas use decimal.js 10.6.0 (ADR-004), rounded to paise at output. `commercial.priceVariation` golden changes from 999.9999999999995 to 1000 (re-captured; N4 change). Quantities are unchanged.
- CF-005, CF-006, CF-012, CF-013, CF-016 remain open: each needs the named input.

## 2026-10-20 — Part 08 approved (D-058)
- Owner approved Part 08 slices S1 and S2. Slices S3 to S5, the screens and routes, partitioning, the nightly job, external anchoring and the independent review remain open.

## 2026-10-20 — Part 08 slice S2 (D-057)
- Added migration `202610192100_secgov_security_events`: login history, security events, event status history (all append-only).
- Added `src/secgov/security.ts`: six detection rules, status flow with reasons, login history reads. Sign-in records each outcome inside its transaction.
- 6 new tests. Assumption A-28 (thresholds).

## 2026-10-20 — Part 08 slice S1 approval (D-056)
- Owner approved slice S1. Explorer and timeline screens, partitioning, the nightly job, external anchoring, slices S2 to S5 and the independent review remain open.

## 2026-10-20 — Part 08 slice S1 (D-055)
- Added migration `202610192000_secgov_audit_chain`: `sec_audit_log` (hash-linked per tenant, append-only) and `sec_sensitive_reads`.
- Added `src/secgov/audit.ts`: writer, chain verification, record timeline, sensitive-read logging, account masking. The unit of work now writes to the chain (`core/uow.ts`).
- 11 new tests; existing suites updated to read the chain. Assumptions A-26, A-27.

## 2026-10-20 — Part 07 approved (D-054)
- Owner approved Part 07 with conditions: open medium and low items, the human independent review, the identity provider (CF-013) and route rules A-20 and A-22.

## 2026-10-20 — Part 07 review fixes (D-053)
- Interim independent review found 15 high-severity defects. Fixed in code, with tests: no-record fallback, deny over elevation, revocation in the decision path, login ordering, lockout on wrong codes, MFA downgrade, permission checks on approvals, linked-account maker-checker, authority limits bound to the signer, tenant-wide deny in lists, server-side export counts with fresh step-up, assignment ceilings and clean scope.
- Open items and the approval hold are in `modules/iam/review-2026-10-20.md` and D-053.

## 2026-10-20 — Part 07 slices S1, S4, S5 approval (D-052)
- Owner approved S1 (on assumptions A-17, A-18), S4 and S5. The identity provider (CF-013), Argon2id, Part 08A, route handlers and the independent review remain open.

## 2026-10-20 — Part 07 slices S1, S4, S5 (D-051)
- S1: authentication engine (scrypt, TOTP, sessions with rotating refresh tokens, devices, lockout, reset), OIDC PKCE and claim checks. Identity provider still unnamed (CF-013).
- S4: privileged elevation, joiner/mover/leaver with immediate revocation, access reviews, export controls, shadow comparisons.
- S5: request pipeline and route registry with a build-time check (`npm run iam:routes`, part of `check:all`).
- Migrations `202610191850_iam_authentication` and `202610191900_iam_privileged_reviews`. Assumptions A-17 to A-21. Local keys `TOKEN_SIGNING_KEY` and `MFA_ENCRYPTION_KEY` documented in LOCALHOST.md.

## 2026-10-20 — Part 07 slice S3 approval (D-050)
- Owner approved slice S3. Slices S1, S4, S5, the toxic role-pair check, the vendor bank window and the independent review remain open.

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
