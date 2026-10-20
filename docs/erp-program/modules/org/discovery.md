# Part 06 discovery, plan and delivery record

Module `org`. Part 06 — Enterprise Structure: Organisation, Company, Project & Site. Status: **APPROVED by the owner 2026-10-20 (D-043) for slice S1**. Slices S2–S5, routes and screens, and the independent review (Part 00 §5.8) remain open. Depends on Part 05 (APPROVED).

## 1. Discovery
- Searched the repository for existing organisation, company, legal entity, branch, department, cost centre, project and site code. Nothing exists beyond the shared kernel's settings and numbering. This is a BUILD for this slice, not an EXTEND (the legacy-built mark in the spec cannot be verified here; the Part 01 inventory recorded it as absent).
- Keywords from §4 searched: company, branch, office, department, division, project, site, location, cost centre, profit centre, geofence, allocation. Only the shared kernel's settings and numbering match, and they are generic.
- The spec's session card asks for one slice per session and a plan first. This document is that plan; the code below is slice S1.

## 2. Decisions taken (assumptions)
- **D-042 (one hierarchy table).** The spec lists separate tables for groups, branches, business units, divisions and departments. They share one lifecycle, one approval rule and one parent rule, so they are stored in `org_units` with a type. The spec's table names can be views later if reports need them.
- **Maker-checker on every create.** A record is pending until a second person approves it (CP-ORG-02). Pending records are not used by other modules.
- **Deactivate, never delete.** The application role has no DELETE right; a test checks it.
- **Effective-dated hierarchy.** Each reparent and deactivation writes an append-only history row with its effective date. The spec's "no retroactive effect on closed periods" is enforced when periods exist (Part 05 `core_financial_periods`); no closed-period check runs yet.
- **Transactions check deferred.** Deactivation refuses only active children. The check "unit has transactions" needs Parts 26 and 31; it is a hook to add then.
- **Approver identity** is passed in, as in Part 05 settings. The approver's role is checked when Part 07 (authorisation) exists.

## 3. Execution phases and deliverables
| Phase | Deliverable | Status |
|---|---|---|
| P0 Discovery | This document: findings, decisions, risks | Done |
| P1 Data model | Migration `202610191400_org_structure` (up and down), lint clean | Done (S1 tables) |
| P2 Services | `src/org/structure.ts` (create, approve, register, reparent, deactivate, centres, read) | Done (S1) |
| P3 Validation | `src/org/validation.ts` (PAN, GSTIN check character and consistency, state, codes, coordinates, dates) | Done (S1) |
| P4 Tests | 11 pure and 26 database tests; coverage scope includes `src/org` | Done (S1) |
| P6a Slice S2 | Project and site masters, lifecycle gates, templates (`src/org/projects.ts`, migration `202610191500`); 39 tests (pure and database) | Built; APPROVED by the owner 2026-10-20 (D-045) |
| P5 Interfaces | Routes and screens (`/admin/org`) | Not started: needs Part 07 authentication. Deliberately not exposed unauthenticated |
| P6 Slices S3–S5 | LBS (S3), geofences, allocations and context switcher (S4), closure checklist and reports (S5) | Planned, not built |
| P7 Review | Independent reviewer (Part 00 §5.8; Risk: High) | Open: required before the Part is considered reviewed. The owner approval (D-043) does not replace it |

## 4. Requirements status (S1 scope)
| Requirement | Status |
|---|---|
| REQ-ORG-F01 hierarchy masters, maker-checker | S1 built: legal entities, registrations, units, cost and profit centres. Group-level masters beyond the fields stored are not modelled |
| REQ-ORG-F02 explorer and drag-to-reparent | Service built (reparent with validation and history). Explorer UI deferred (P5) |
| REQ-ORG-F03 to F12 | Planned for S2–S5 |

## 5. Verification (S1)
- `npx vitest run src/org`: 37 tests pass (11 pure, 26 database). Covered: PAN and GSTIN rules (the documented sample GSTIN passes; a changed character fails), maker-checker, duplicate code and PAN as conflicts, GSTIN bound to the entity's PAN and state, parent rules, parent approval, cycles, effective-dated history, deactivation with children refused, cost-centre rules, tenant isolation, no delete right.
- Migration lint clean.

## 6. Risks and open items
- **Unauthenticated writes.** The service functions do not check who calls them. They must not be exposed as routes until Part 07 is built. Recorded as a blocker for P5.
- **Closed-period rule** not enforced yet (needs period status use in Part 26).
- **Hindi and regional labels** not included.
- **GSTIN validity** is checked for format, check character and consistency only. It is not verified against the GST portal (no external service in this environment).
- **Legacy mapping** (`org_status_map`) is not needed: greenfield (A-01).

## 7. Reporting format for each phase
Each phase closes with a report in this form, in the commit message and in this file:
1. **Scope delivered** — the requirement IDs and the files.
2. **Verification** — the exact commands run and their results (counts, not adjectives).
3. **Assumptions** — new ones, with IDs in `ASSUMPTIONS.md` or `DECISIONS.md`.
4. **Not delivered** — each item, and the reason (blocked by which Part or input).
5. **Decisions needed** — the minimum input, if any.
