# Part 13 — Dashboard engine, launchpad, global search and drill-down: discovery, plan and execution prompt

Status: **discovery and plan only. No code.** Part 13 is not yet approved by the owner (Part 00 §1.2). Build of slice S1 waits for that approval. Risk is Medium, so an independent human reviewer is not mandatory (Part 00 §5.8).

Dependencies (Part 00 §1.2): Part 10 (approved, D-063; S1 built, pending approval) and Part 12 (approved for S1 to S3, D-072; S4 and S5 open). Both are met for the slices in this plan. Part 12 S4 and S5 are not needed by Part 13 S1 to S3.

## 1. Discovery summary

| Area | Present | Where | Gap against Part 13 |
|---|---|---|---|
| Dashboards and widgets | None. The home page is a static empty state | `src/app/page.tsx` | Full gap (REQ-DASH-F01, F02) |
| Launchpad | Empty-state template with tiles from the navigation model | `src/design/ui/templates.tsx` (`Launchpad`) | Tiles are not personal and are not permission-aware beyond the navigation filter (A-76) |
| Navigation and permission filter | Permission-filtered, live-route-filtered navigation; server check through `can()` | `src/design/navigation.ts`, `src/design/navigation-access.ts` | Reusable for widget visibility (REQ-DASH-F02: a widget whose module is off is not rendered) |
| Permission engine | `can()`, grants, scopes, data-scope predicates | `src/iam/pdp.ts`, `src/iam/policy.ts` | Reusable for widget and search permission checks |
| Session scope | `VerifiedSession` carries `projectIds` and `siteIds` | `src/core/context.ts` | Search scope and widget data scope can use it directly |
| KPI calculations | Pure functions: physical progress, EAC/CPI, CVR margin, material variance, plant utilisation, labour productivity, certification lag, working days, procurement cycle | `src/domain/kpi.ts` (with tests) | Calculations exist; no registry, labels, formula references or drill paths |
| Output labels | DataLabel is named in Part 12 (ACTUAL, CALCULATED, FORECAST, AI, PROVISIONAL) | Part 12 plan; `src/design/ui` has no DataLabel yet | DataLabel component not built (Part 12 S4) |
| Search | None. ADR-003 (accepted) says PostgreSQL full-text first; OpenSearch only if p95 search exceeds 500 ms | `docs/erp-program/adr/ADR-003.md` | No index, no query service, no palette (REQ-DASH-F07 to F10) |
| Charts | None. Chart library is on TECH_RADAR HOLD and in Part 12 §2.5 | `docs/erp-program/TECH_RADAR.md` | Needed for trend widgets; decision required (§2.2) |
| Events | Outbox, inbox, broker interface (Part 10 S1) | `src/evbus/*` | Indexing and widget refresh consume events; no consumers yet (Part 10 S2 to S5) |
| Activity data | Hash-chained audit of every write (`writeAudit`), security events, login history | `src/secgov/audit.ts`, `src/secgov/security.ts` | The timeline can start from audit today; module sources arrive with their Parts |
| Recent and preferences | `ui_user_preferences` (per-user, pinned routes capped at 10) | `db/migrations/202610192600_ds_user_preferences` | Recent (last 50), favourites and personal widgets need new tables |
| Entities that exist and could be indexed now | Legal entities, projects, sites, allocations, users (`auth_users`) | `src/org/*`, `src/auth/users.ts` | Documents, POs, GRNs and the rest do not exist yet; they index when their Parts build |
| Authenticated pages and HTTP session | None. No page resolves a signed-in user or tenant from a request | Part 08A S2+ and the session layer (A-87) | **Critical dependency.** Home, personal workspace, search and drill pages cannot show real per-user data until this exists (§2.1) |

## 2. Decisions needed from the owner (minimum)

1. **Session and HTTP layer first (critical).** Every Part 13 screen and route needs a signed-in user and tenant from the request. That is the Part 08A session layer, which is not built (A-87). Options: (a) build the session layer as the first slice of Part 13, before any screen (**recommended** only if Part 08A S2 to S6 are not scheduled first); (b) build Part 13 S1 as services, registry and tests only, with screens and routes after the session layer. **Recommended: (b).** It keeps the engine verifiable now and avoids a second session design.
2. **Chart library.** Trend widgets, the S-curve and the drill tables need charts. Options: Apache ECharts (Apache-2.0, covers every allowed chart form including Gantt and heatmap; **recommended**, as in Part 12 §2.5) or Recharts (MIT, narrower). Requires an ADR (TECH_RADAR HOLD). Until then widgets show numbers and trend as text only.
3. **Search engine.** Confirm PostgreSQL full-text as the start (ADR-003), with the OpenSearch trigger unchanged. The 50 million document target in Part 13 §14 is not reachable with the current volume evidence; the trigger is measured in S3 and decides the move.
4. **Interim KPI registry.** Part 75 (metric catalogue) is not built. Accept an interim registry in code, with the same fields, replaced when Part 75 is approved (A-99).
5. **Confidentiality classes for search.** The ACL tags need the classes used in the owner's documents (for example: general, confidential, restricted, secure). The owner names them, or accepts the four above as the default.
6. **Role default spaces (DS-17).** The owner confirms which widgets each role starts with. Plan: the widget list in §3 S1, filtered by the role's permissions.
7. **Synonym list.** The examples in REQ-DASH-F08 (TMT ↔ reinforcement steel, shuttering ↔ formwork, JCB ↔ backhoe loader) are the starting list. The owner approves or extends it before S3 (A-97).

## 3. Assumptions proposed for Part 13

Proposals, recorded in `ASSUMPTIONS.md` only when the owner approves Part 13.

- **A-93 Widget contract.** A widget data API returns `{value, unit, period, previous, target, trend, label, formulaRef, asOf, drillRoute}` (REQ-DASH-F01). A widget with no data shows its own empty state. A widget whose owning module is not live is not registered for rendering; there are no placeholders (REQ-DASH-F02).
- **A-94 Registry as code.** The widget and KPI registry is code in the repository, checked by tests (CP-DASH-01: label, formula reference, threshold and drill path are required fields). Only role-space publications are stored in the database (`ui_role_spaces`, versioned).
- **A-95 Personal workspace.** A user's added, removed, resized and reordered widgets are stored per user (`ui_user_space_overrides`) and reset to the role default on request. Only permitted widgets can be added.
- **A-96 Search.** PostgreSQL full-text search over one index table (`srch_documents`) with a `tsvector` and a GIN index. Each row carries ACL tags: tenant, company, project, site, department, owner, confidentiality class. The query service re-checks permission for every candidate row at query time, using the session's project and site scope and `can()`. Counts are computed after that filter, so a hidden record never affects a count (CP-DASH-02).
- **A-97 Synonyms.** Seeded from the owner-approved list (§2.7). Zero-result queries are logged to `srch_queries_analytics` for tuning.
- **A-98 Indexing.** Indexing is done by inbox consumers of catalogued events (Part 10), with a nightly reconciliation job. Until Part 10's scheduler exists, reconciliation runs as a command.
- **A-99 Drill registry.** Code-first, with a conformance test for every registered aggregate: its drill path resolves to a list or a record, and the same registry is used by widgets, reports, search and trace nodes (CP-DASH-03). The interim registry is replaced by Part 75 when it is approved (§2.4).
- **A-100 Timeline.** A read model derived from the audit chain and catalogued events, read-only. It is never the source of truth (Part 13 §6). Restricted entries are shown as "restricted activity" under policy. PDF export waits for the reports Part (76).
- **A-101 Data labels.** Output labels are the Part 12 DataLabel values (ACTUAL, CALCULATED, FORECAST, AI, PROVISIONAL). A calculated value carries its formula reference from the KPI registry.

## 4. Execution phases, deliverables and gates

Each phase is one session (Part 00 §12, Annex E1). A phase starts only when the previous phase's gates are green and the owner has approved the phase where Part 00 requires it.

**Phase 0 — Discovery and plan (this session).** Deliverables: this document; PROGRESS_REGISTER status for `dash`. Gate: none (no code). Stop and report.

**Phase 1 — S1 Widget runtime, registry, role spaces, personal workspace.** Deliverables:
- Widget and KPI registry as code (`src/dash/registry.ts`) with the required fields checked at start-up (CP-DASH-01; A-94).
- Widget data contract and a runtime that runs widget data loaders in parallel with per-widget timeouts and per-widget error isolation (REQ-DASH-F01).
- Role default spaces, with widgets filtered by `can()` and by module liveness (REQ-DASH-F02).
- Tables `ui_role_spaces` (versioned publication) and `ui_user_space_overrides` (additive, RLS, down scripts, DB_EXTENSIONS rows).
- Common widgets that have real data now: My Projects and Sites (from allocations, Part 06), Security Alerts for users with `secgov.security.view` (Part 08 S2), My Sign-ins (Part 08 login history), and Launchpad tiles from the navigation model.
- Tests: CP-DASH-01 rejects a widget without label, formula, threshold or drill path; a widget whose module is off is absent; a widget loader that throws shows its own error and does not break the page.

Gates: `npm run check:all` 9 of 9; the registry tests above. Screens and routes wait for §2.1.

**Phase 2 — S2 Designer, global filters, frames.** Deliverables: role-space designer with versioned publish and persona preview (REQ-DASH-F04); global filters (company, project, site, period, WBS) in the URL (REQ-DASH-F05); Project 360 frame (DS-18), site dashboard frame, department workspace frame (DS-19) and control-tower layout standard (KPI strip, exceptions, heatmap and trend, drill table) (REQ-DASH-F06). Frames are built from the Part 12 templates.

Gates: check:all; the designer's publish is maker-checked (`dash.space.publish`); a persona preview shows no widget the persona cannot open; axe passes on each frame in three themes (the Part 12 harness).

**Phase 3 — S3 Search indexer, query service, palette, actions, recent and favourites.** Deliverables: `srch_documents`, `srch_synonyms`, `srch_queries_analytics`, `cmd_actions`, `usr_recent`, `usr_favourites` (additive migrations); indexer as inbox consumers (A-98); query service with scopes, facets, typed prefixes and synonyms (REQ-DASH-F08); command palette with navigate, create and permitted actions, and context actions from the action registry (REQ-DASH-F09); recent (last 50), favourites and pinned (REQ-DASH-F10). First indexed entities: projects, sites and people (`auth_users`, name and User ID, only for users the viewer may see).

Gates: check:all; the ACL test matrix (CP-DASH-02): a user without access to project P2 searching "PO/P2" gets no result and no count; a hidden or revoked record never appears; a stale index still gives a correct answer because permission is checked at query time. Measure p95 on the volume dataset and record it for the ADR-003 trigger.

**Phase 4 — S4 Drill registry, hierarchy navigator, where-used, conformance tests.** Deliverables: drill registry with dimension keys per aggregate (`drill_registry`, A-99); hierarchy navigator (Company → Project → Site → WBS → Activity → BOQ) with a KPI context panel at each level; management path breadcrumb (REQ-DASH-F12); where-used links on masters (REQ-DASH-F13) that show only the entities that exist; drill-conformance tests for every registered KPI.

Gates: check:all; every registered KPI has a drill path that resolves (CP-DASH-03); a drill never shows a record outside the viewer's scope.

**Phase 5 — S5 Activity timeline.** Deliverables: `tl_entries` read model (view first, materialised only if measured), built from the audit chain and catalogued events (A-100); timeline tab on object pages and project timeline; filters; restricted-activity handling by policy; export deferred to Part 76.

Gates: check:all; the acceptance scenario: a record's timeline shows approval, receipt, invoice and payment events in order (once their Parts exist; until then, the audit events of the record in order); a restricted entry shows as "restricted activity" and no content.

**Deferred and out of this build:** the WorkChat Messages scope (REQ-DASH-F15, Part 25A, not approved); mobile Today home (Part 14); the Insight card and semantic re-ranking (Part 79, not approved); module widgets such as approvals, tasks, gates and exceptions (owning Parts 14 to 18, not built), which are registered only when those Parts go live.

**Final gate for Part 13 (before the owner approves the part).** Acceptance criteria in §16 each with evidence; the ACL matrix green; drill conformance green for every registered KPI; design owner review of the frames.

## 5. Reporting format (required for every phase)

Each session closes with this report, in this order. Missing items mean the phase is not complete.

1. **Phase and slice:** for example `Part 13 · S1`.
2. **Outcome:** one line, stated plainly: built, partly built, blocked, or planned only.
3. **Deliverables:** a list, each with the file or route path and the requirement id (REQ-DASH-Fxx or CP-DASH-xx).
4. **Assumptions and decisions:** the new assumption ids (A-93 onward) and decision ids (D-xxx). Nothing is recorded as approved unless the owner approved it.
5. **Evidence:** the exact command and its result for each gate: `npm run check:all` (x of 9 passed), the named tests, the ACL matrix results, the drill-conformance count, and any search latency measured.
6. **Screens and routes:** each screen or route built, and whether it waits for the session layer (§2.1).
7. **Not built and why:** each item from the phase plan that is not done, with the reason.
8. **Owner items:** each question that needs the owner, with the minimum information needed to answer it.
9. **Next step:** the next phase, and whether it needs approval first.

Documentation updated in the same session: `ASSUMPTIONS.md`, `DECISIONS.md` (only for owner-approved items), `CHANGELOG.md`, `DB_EXTENSIONS.md` (for each migration), `modules/dash/traceability.csv`, `PROGRESS_REGISTER.csv` (via `npm run adopt:program`).

## 6. Enhanced execution prompt for Part 13

Use this with Annex E1 at the start of each Part 13 session. The universal requirements U1–U20 (Part 00 §12.2) apply without being restated.

> You are a senior full-stack developer and enterprise architect working on the ERP in `/home/user/ERP_Construction`, branch `claude/bold-allen-rj3t08`.
>
> 1. Read `modules/dash/discovery.md`, Part 13, ADR-003 and the Part 00 sections it cites. Inspect `src/iam/pdp.ts`, `src/iam/policy.ts`, `src/core/context.ts`, `src/domain/kpi.ts`, `src/design/navigation-access.ts` and `src/evbus/` before you change anything.
> 2. Work on one slice only. Phase 0 produces a discovery summary and plan and no code.
> 3. A widget with no owning module live is not registered. Never render placeholder data, sample values or a widget that does nothing.
> 4. Search permission is checked at query time for every candidate row. A count is computed after that check. A stale index never widens access.
> 5. Do not add a package without an ADR (CP-ARCH-01). Charts need the chart ADR (§2.2) before a chart is drawn.
> 6. Record every assumption with an id from A-93 onward. Record an owner decision only when the owner has given it in their own words.
> 7. Preserve working behaviour. Additive, backward-compatible changes only. Any migration ships with a down script, a DB_EXTENSIONS row and an entry in the migration list test.
> 8. Stop and report when a change is destructive, replaces existing code, or conflicts with a documented decision, including when a screen needs the session layer that does not yet exist.
> 9. Run `npm run check:all` with the database running and `.env.test` loaded. Do not commit on a failing run; stage first so the secret scan sees the same files.
> 10. Close the session with the reporting format in §5 of this document.
