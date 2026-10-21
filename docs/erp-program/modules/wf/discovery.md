# Part 16 — Workflow, business rules and delegation of authority: discovery, plan and execution prompt

Status: **discovery and plan only. No code.** Part 16 is not yet approved by the owner (Part 00 §1.2). Build waits for that approval and for the owner's answers in §2. Risk is **High**, so an **independent human reviewer is mandatory** (Part 00 §5.8). Agent reviews do not satisfy this.

Dependencies (Part 00 §1.2):
- Part 06 (approved, D-043, D-045 and later slices built and approved): met.
- Part 07 (approved with conditions, D-054; medium and low items and the independent review are open): met with conditions.
- Part 08 (approved for S1 and S2, D-058; S3 to S5 open): met for S1 and S2 only.
- Part 10 (plan approved, D-063; **S1 built (D-064), approval pending**): **not yet met**. The owner must approve Part 10 S1 or accept the condition (§2.1).

## 1. Discovery summary

| Area | Present | Where | Gap against Part 16 |
|---|---|---|---|
| Approval engine | **None.** No workflow, state-machine, instance or task code and no `wf_*` table. Old Prompts 20 and 21 are marked legacy-built, but their code is not in this repository | `src/` (searched) | Full build. The "VERIFY & EXTEND" default cannot be checked here (§15 of the Part) |
| Authority limits | Limit proposal, approval and lookup, with the most specific limit winning. Written to be "consumed by approval routing (Part 16)" | `src/iam/authority.ts` (`proposeLimit`, `approveLimit`, `limitFor`, `mayApprove`) | Cumulative evaluation (DR-13), effective-dated matrix by document type and amount band, and the seed (REQ-WF-F04) are not built |
| Segregation of duties | Rules, a preventive check inside a transaction, action recording and rule approval with maker-checker | `src/iam/sod.ts` (`preventiveCheck`, `recordAction`, `approveRule`) | Approver resolution must call it (REQ-WF-F05). Not yet wired to any approval |
| Maker-checker pattern | Used for permissions, limits, SoD rules and access reviews | `src/iam/*` | Reuse for definition activation (CP-WF-04). No separate pattern needed |
| Event bus | Envelope, outbox, inbox, broker and relay (Part 10 S1) | `src/evbus/*`, `src/db/outbox.ts` | Transition events (`wf.*`) can use it. Part 10 S1 approval is pending (§2.1) |
| Audit | Audit writes with hash chain (Part 08) | `src/secgov/audit.ts`, `sec_audit_log` | Workflow action log must write through the same audit (CP-WF-05 and §6) |
| Working calendar | Date helpers only: `isoDate`, `addDays`, financial year, period number. **No working-day or holiday calendar** | `src/core/calendar.ts` | SLA timers on working calendars (REQ-WF-F08) need the Part 05 calendar; not built |
| Session and acting identity | **None** (A-87). No HTTP layer | — | The action API (REQ-WF-F19), the acting identity, step-up MFA and the inbox all need the session layer |
| Escalation ladders | Not built (Part 18 not started) | — | Escalation at 100 % (REQ-WF-F08) and condition tasks (REQ-WF-F06) have no target yet |
| Evidence sources | Parts 44, 46, 47 and 65 not built | — | Every evidence section shows "unavailable" until its source exists (REQ-WF-F13) |
| Decision tables and simulation | None | — | Build (REQ-WF-F03, F11). No DMN library is assumed |
| Migration tables | `wf`, `rul` and `dec` module codes are in the Part 16 header; confirm they are in the Annex C index used by the migration lint | `scripts/build-program-index.mjs` | Check at S1 before the first migration |

## 2. Decisions needed from the owner (minimum)

1. **Part 10 S1 approval.** Part 16 needs Part 10 approved. Options: (a) approve Part 10 S1 now (**recommended**: the outbox and envelope are already built and tested); (b) accept the plan-level approval as enough for Part 16 S1, which uses events only at the end of S1. Owner decides.
2. **Session layer first (critical).** The action API, the acting identity, step-up MFA and the inbox all need it. Options: (a) build the session layer as the first slice of the next session-dependent Part, shared with Parts 08A, 14, 15 and 16 (**recommended**; the same gap has blocked four Parts); (b) keep Part 16 to the engine and tests until it exists. Owner decides.
3. **Current authority policy (blocking for seed).** REQ-WF-F04 seeds the DoA matrix from the company's existing authority policy. The owner supplies the current limits per document type, company and project, and the amount bands. **No amount is assumed in this plan.**
4. **Current routing (blocking for legacy parity).** REQ-WF-F16 reproduces current routing first. Options: (a) an export of the live routing rules and approval chains (**recommended**, the same kind of export requested for Part 15); (b) the seed routes in REQ-WF-F17 confirmed one by one by the process owners. Owner decides and names the process owner per document type.
5. **Seed routes (REQ-WF-F17).** The chains in the Part are the starting point. The owner confirms each chain and the amount above which Management, CFO or Project Director approves.
6. **Cumulative window (DR-13).** The acceptance example uses 7 days for the same vendor, material and project. Owner confirms the window and the dimensions (A-149).
7. **Working calendar.** SLA timers need working days and holidays per project and site (Part 05). Owner confirms the calendar source; the core module has none yet.
8. **Step-up MFA thresholds** (REQ-WF-F06, Part 07). Owner sets the amount and action thresholds.
9. **Bulk approval limit** (REQ-WF-F12). Owner sets the maximum amount and the document types allowed.
10. **Evidence sources.** Accept that the evidence panel ships with "unavailable" for sources not yet built (Parts 44, 46, 47, 65), or name a date for each source.
11. **Interim escalation.** Until Part 18 exists, expired SLA only reminds and returns, with no ladder. Owner confirms this is acceptable.
12. **Independent human reviewer** for Part 16 (Part 00 §5.8). Owner names the person.

## 3. Assumptions proposed for Part 16

Proposals, recorded in `ASSUMPTIONS.md` only when the owner approves Part 16. Numbering starts at A-146 because A-145 is already used by the Part 15 S2 proposal.

- **A-146 One engine.** The workflow engine is the only approval engine. It uses `iam/authority.ts` for limits and `iam/sod.ts` for SoD. It does not copy either.
- **A-147 Versioned definitions.** Definitions and decision tables are versioned with effective dates. A running instance keeps the version it started on. Activation uses the maker-checker pattern already in `iam`.
- **A-148 Amount snapshot.** The amount at submission governs routing. An amendment starts a new instance (§6).
- **A-149 Cumulative window.** Default 7 days, by vendor, material and project, until the owner confirms (§2.6). A breach raises DR-13, and the instance is routed at the higher band.
- **A-150 Evidence and context.** A source that is not available shows "unavailable" with its reason. The context snapshot is stored with the decision (CP-WF-05), so the record shows what the approver saw.
- **A-151 SLA.** Timers use a working calendar from Part 05. At 50 % and 90 % there are reminders. At 100 % the item escalates when a ladder exists, and otherwise returns. Expiry never approves.
- **A-152 Action safety.** The action API takes an expected state version (a stale version returns 409 with who acted first) and an idempotency key (a repeated key creates no second action). The step-up threshold values come from Part 07 policy, set by the owner.
- **A-153 Decision tables.** Evaluated by a small evaluator written in the repository. No rules library is added without an ADR (CP-ARCH-01).
- **A-154 Simulation.** Runs read-only over the last 90 days of documents, using their stored snapshots. It never re-runs side effects.

## 4. Execution phases, deliverables and gates

**Phase 1 — S1 State machines, definitions, actions and legacy adapter.** Built against the core, without the session layer: a pure state-machine validator (every branch ends in a terminal state, no unreachable state, guards and side effects declared), the instance and task tables with their migrations, the action log written through the existing audit, the transition events through the outbox, and the read-only legacy mirror (REQ-WF-F16). The HTTP action API and the acting identity wait for §2.2.
Gates: `check:all` 9 of 9; migration rollback rehearsal; tests for every rule in §6 that does not need the session (no self-approval, one approver never at two levels, the amount snapshot, and definitions that never change a running instance).

**Phase 2 — S2 Decision tables, DoA matrix, approver resolution and simulation.** Decision-table evaluator with completeness and overlap checks (REQ-WF-F03). DoA matrix evaluation with cumulative checks and DR-13 (REQ-WF-F04). Approver resolution filtered by authority limit and SoD, and never auto-approving when nobody is resolved (REQ-WF-F05). Simulation over 90 days (REQ-WF-F11).
Gates: `check:all`; the acceptance examples of §16 for a ₹12 lakh PO and for three ₹4.5 lakh POs to the same vendor; a simulation that lists routing differences before activation.

**Phase 3 — S3 Delegation, SLA, emergency approvals and amendments.** Delegation with scope, dates, one hop and the delegator's authority (REQ-WF-F07). Working-calendar SLA timers, reminders at 50 % and 90 %, and return at expiry (REQ-WF-F08, A-151). Emergency approvals with a regularisation deadline (REQ-WF-F10). Amendments with their own instance and compare view (REQ-WF-F09).
Gates: `check:all`; SLA expiry escalates and then returns and never approves; an unregularised emergency approval reaches L3.

**Phase 4 — S4 My Inbox and workflow widget.** Inbox with split view and filters, the item card with risk flags, bulk approval within its rule, and the workflow widget rendered from the API (REQ-WF-F12, F14). Needs the session layer (§2.2) and the design system (Parts 12 and 15 patterns).
Gates: `check:all`; accessibility at 360, 820 and 1440 in three themes (CP-UXMIG-03 pattern); the inbox p95 under 1 s for 500 items (§14).

**Phase 5 — S5 Evidence panel and context snapshots.** The panel per document type with permission-gated sections, parallel sources, explicit "unavailable" markers, and a snapshot stored with each decision (REQ-WF-F13, CP-WF-05, A-150). Sources not yet built stay "unavailable" until their Parts deliver.
Gates: `check:all`; a test where the treasury source is down and the decision still records a snapshot with "Cash forecast unavailable"; evidence panel under 2 s.

**Standing rule for every phase.** No phase starts before the owner approves the previous one. Approval logic lives only in this engine: any other code that approves something is a defect to fix, not a feature to keep.

## 5. Reporting format (required for every phase)

1. **Phase and slice:** for example `Part 16 · S1`.
2. **Outcome:** one line: built, partly built, blocked, or planned only.
3. **Deliverables:** each with its file or route path and requirement id (REQ-WF-Fxx or CP-WF-xx).
4. **Assumptions and decisions:** new assumption ids (A-155 onward after this plan) and decision ids. Nothing is recorded as approved unless the owner approved it.
5. **Evidence:** the exact command and result for each gate: `npm run check:all` (x of 9), the named tests, the migration rollback result, and the acceptance scenario results.
6. **Controls:** each CP-WF control, with its enforcement status and the test that proves it.
7. **Not built and why:** each item of the phase plan that is not done, with its reason.
8. **Owner items:** each question that needs the owner, with the minimum information needed to answer it.
9. **Next step:** the next phase, and whether it needs approval first.

## 6. Enhanced execution prompt for Part 16

Use the Part 16 specification and this discovery. Start from §2: no seed amount, route or bulk limit is assumed. In this order:

1. Confirm §2.1 (Part 10 S1) and §2.2 (session layer). If §2.2 is (b), keep the action API out of the build and say so in the report.
2. Build Phase 1 (§4) with tests and the rollback rehearsal. Run `check:all` on the staged tree. Report in the format of §5.
3. Do not add a second approval path, a rules library, or a client-side routing copy. Any such code is removed or moved into the engine.
4. Never auto-approve. Expired SLA, unresolved approvers and failed evidence sources all stop or return the item.
5. Stop and report at each approval point. Ask only for what §2 names.
