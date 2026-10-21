# Part 17 — Protocol and control engine, RACI, action ledger and policy-to-protocol: discovery, plan and execution prompt

Status: **discovery and plan only. No code.** Part 17 is not yet approved by the owner (Part 00 §1.2). Build waits for that approval and for the owner's answers in §2. Risk is **High**, so an **independent human reviewer is mandatory** (Part 00 §5.8). Agent reviews do not satisfy this.

Dependencies (Part 00 §1.2):
- Part 06 (approved, D-043 and later slices): met.
- Part 07 (approved with conditions, D-054; medium and low items and the independent review open): met with conditions.
- Part 16 (slices S1 to S5 approved, D-098 to D-106; the final approval of Part 16 waits for the open items, including the Part 10 S1 approval and the independent review): **met for the data side only**. Part 17 uses Part 16 for exception approvals, so the condition is carried here.

## 1. Discovery summary

| Area | Present | Where | Gap against Part 17 |
|---|---|---|---|
| Protocol evaluation log | An interim table written by the unit of work | `core_protocol_evaluations` (Part 05); `src/core/uow.ts` (`evaluate`) | The control-point registry, modes, thresholds and the check library are not built. The log is the interim adapter that the Part 17 tables replace behind the same interface |
| Action ledger | An interim table written by the unit of work | `core_action_ledger`; `uow.ledger` with the lifecycle action vocabulary (CREATED … REVERSED) | RACI, on-behalf-of, device and location, the accountability tab and the responsibility handover are not built |
| Stage contract for controlled services | Hook declarations for controlled service methods (CP-CORE-01) | `src/core/hooks.ts` | The check library and the gate API are not built; the hooks can carry the stage declarations |
| Segregation of duties and permissions | Rules, preventive check, actions log, and permission decisions | `src/iam/sod.ts`, `src/iam/pdp.ts` | Used by CP `SOD` and by RACI. Enforcement at the action (CP-PROTOCOL-01) is new |
| Authority limits and approvals | Limits and maker-checker; the workflow engine with exceptions' approval path | `src/iam/authority.ts`; `src/wf/*` (Part 16 S1–S5) | Exception approval is routed through Part 16. The exception matrix and value caps are new |
| Decision snapshots | Panels stored with each decision | `src/wf/evidence.ts`, `dec_context_snapshots` | Reused for evaluation inputs snapshot (REQ-PROTOCOL-F02) |
| Escalation ladders | Not built | Part 18 not started | Violations can only be handed off; the ladder runs later |
| Events and outbox | Envelope, outbox, inbox, broker, relay (Part 10 S1) | `src/evbus/*`, `src/db/outbox.ts` | Control-cycle tracking listens to events. Part 10 S1 approval pending |
| Budget, stock, drawings, permits, checklists, documents, JML, scheduled reports, retention | Not built | Parts 39, 47, 34, 70, 69, 19, 54, 76, 84 | Each check that depends on them reports "unavailable" with its reason until its part is built |
| Session and acting identity | None (A-87) | — | Gate status for a user, exception requests, acknowledgements and the workspaces all need the session layer |
| Policy repository and distribution | None | — | Built in S5 as data; distribution needs the people records (Part 54) |
| Legacy evidence (old Prompts 22, 23, 149) | Marked legacy-built, but not in this repository | `docs/erp-program/LEGACY_CROSSWALK.csv` | The "VERIFY & EXTEND" default cannot be checked against code here; this is a full build |
| Partitioned evaluation log | Not built; the interim table is not partitioned | `core_protocol_evaluations` | Monthly partitions are a database change (§2.8) |

## 2. Decisions needed from the owner (minimum)

1. **Upstream approvals and the session layer (blocking for the user-facing parts).** Part 16 final approval and the Part 10 S1 approval, and the session layer (A-87), which the gate status, exception requests, acknowledgements and workspaces need. Recommendation: build the session layer before S2's user-facing parts; S1 and S2 data and logic can proceed without it.
2. **Control-point and threshold seeds.** Part 00 §9.2, §9.4 and §9.5 hold the seed values. The owner supplies the CP list, the owners and the threshold values per company and project type. No value is assumed in this plan.
3. **Emergency regularisation window.** The Part states a default of 24 hours (REQ-PROTOCOL-F06). Owner accepts 24 hours or sets another value (A-161).
4. **Roll-out.** Legacy flows start in OBSERVE (N20). Owner confirms this, and names who approves a move to WARN or ENFORCE (CP-PROTOCOL-02, Management).
5. **Compliance score weights** (Part 00 §9.8). The owner supplies the components and weights. The score is not computed until they are set (A-169).
6. **Expression language for CUSTOM checks** (REQ-PROTOCOL-F03). Options: (a) a restricted expression evaluator written in the repository, with a fixed operator list, no I/O and time and size limits (**recommended**: no package; A-164); (b) a third-party expression engine under an ADR. Owner decides.
7. **Evaluation log partitioning and retention.** Monthly partitions with retention set by Part 84 (100 M rows a year, §14). Owner confirms the retention period.
8. **Reason-code catalogue** shared with Part 08. Owner confirms the initial codes per module and the narrative minimum (50 characters for "Other").
9. **People source for policy distribution.** Until Part 54 exists, employee applicability cannot be resolved from live data. Options: (a) manual population of a test roster for the pilot (**recommended**); (b) wait for Part 54. Owner decides.
10. **Acknowledgement methods.** E-signature depends on Part 20. Options: (a) read, accept and declaration now, with e-sign added when Part 20 is built (**recommended**); (b) wait for Part 20.
11. **Independent human reviewer** for Part 17 (Part 00 §5.8). Owner names the person.

## 3. Assumptions proposed for Part 17

Proposals, recorded in `ASSUMPTIONS.md` only when the owner approves Part 17. Numbering starts at A-161 because A-160 is the last recorded.

- **A-161 Emergency window.** An emergency execution is regularised within 24 hours by default. An unregularised one goes to L3 and carries a compliance penalty. The owner confirms the value (§2.3).
- **A-162 One engine, interim adapters replaced.** The control-point registry and `protocol.check` run inside the unit of work. The Part 17 tables replace the interim `core_protocol_evaluations` and `core_action_ledger` behind the same `uow.evaluate` and `uow.ledger` interface, so no caller changes.
- **A-163 Modes.** Each control point has a mode per scope: OFF, OBSERVE, WARN or ENFORCE. A new control point starts in OBSERVE. A move to WARN or ENFORCE needs an OBSERVE impact report and an approval (CP-PROTOCOL-02). Changes are effective-dated.
- **A-164 CUSTOM checks.** A restricted expression language written in the repository: a fixed operator list, no I/O, no network, a time limit and a size limit. No third-party engine is added without an ADR (CP-ARCH-01).
- **A-165 Gate status and offline.** The gate-status API and the device both run the same pure rules module. Offline gate bundles are signed with the Part 14 scheme (A-130) and checked on the device before use.
- **A-166 Exceptions.** Exception approval uses the Part 16 workflow. Value and quantity caps are enforced at consumption in the same transaction as the authorised action, so a second use is refused.
- **A-167 Violations.** Violation ageing uses the Part 16 SLA pattern (working calendar, reminders, no automatic closure). Escalation is a hand-off to Part 18; the ladder itself is not run here.
- **A-168 Accountability.** The action ledger is written by the shared hook for every lifecycle action. CP-PROTOCOL-01 at the execute stage raises an exception (PROCESS_DEVIATION), not a block, when the RACI is missing.
- **A-169 Compliance score.** Components and weights are shown with the score. The score is computed nightly and on demand, and it never triggers an HR action by itself (N23). It is not computed until the owner sets the weights.
- **A-170 Generated policy items.** Every generated control point starts in OBSERVE. A generated item that affects permissions, financial authority, critical workflows, user access, contracts or material controls needs an administrator's approval by someone other than its maker (CP-PROTOCOL-05).

## 4. Execution phases, deliverables and gates

**Phase 1 — S1 Registry, check library, evaluation and gate status.** Built now, without the session layer: the control-point registry tables with versioning (REQ-PROTOCOL-F01), the check library for the checks whose data exists (PLAN_EXISTS, DUPLICATE, THRESHOLD, DOCUMENT_REQUIRED, SOD, TIME_WINDOW, SEQUENCE, RECONCILIATION, CUSTOM through the restricted language), the server evaluation inside the unit of work with inputs snapshot (REQ-PROTOCOL-F02), and the internal gate-status function (REQ-PROTOCOL-F04). Checks whose source is not built (BUDGET_AVAILABLE, STOCK_AVAILABLE, BALANCE_QTY, DRAWING_CURRENT, PERMIT_VALID, CERTIFICATION_VALID, GEO_FENCE, SPEC_APPROVED) return "unavailable" with their reason (A-150 pattern). Migration with rollback; the Part 17 log replaces the interim table with the same interface.
Gates: `check:all` 9 of 9; the protocol test matrix for the paths that exist (API and job, using the same control point); p95 under 50 ms for a cached check, measured with a volume rehearsal; the CUSTOM sandbox refuses I/O, loops and oversize expressions.

**Phase 2 — S2 Exceptions, emergency, thresholds, evidence and reason codes.** Exception types, the exception matrix, validity caps enforced at consumption, expiry, and the pattern signal on repeats (REQ-PROTOCOL-F05); the emergency path with its regularisation timer (REQ-PROTOCOL-F06, A-161); thresholds with maker-checker and effective dates (REQ-PROTOCOL-F07); evidence rules (REQ-PROTOCOL-F08); reason codes with narrative minimums (REQ-PROTOCOL-F09). Approval goes through Part 16.
Gates: the acceptance scenarios of §16 for the 0.8 MT exception (approved, consumed, second use refused) and for the emergency regularised in 20 hours; the emergency not regularised escalates at 24 hours (as a hand-off).

**Phase 3 — S3 Cycles, violations, modes, OBSERVE impact and the console.** Control-cycle tracker listening to events (REQ-PROTOCOL-F10); violations with their state machine (REQ-PROTOCOL-F11); modes with maker-checker (REQ-PROTOCOL-F12); the OBSERVE impact report (would-block and would-warn counts before a mode change); the configuration console data (REQ-PROTOCOL-F13). Needs Part 10 S1 approval for the event listener.
Gates: the OBSERVE report shows would-block counts before a mode change; the mode change refuses without approval (CP-PROTOCOL-02).

**Phase 4 — S4 RACI, action ledger, accountability, scores and handover.** Process catalogue (REQ-PROTOCOL-F14); RACI with templates, bulk assignment, effective dating and the gaps report (REQ-PROTOCOL-F15); CP-PROTOCOL-01 at the execute stage; the action ledger writer with on-behalf-of, device and location (REQ-PROTOCOL-F16); the accountability data for each record (REQ-PROTOCOL-F17); the compliance score with its components (REQ-PROTOCOL-F19); responsibility handover checks for transfer and exit (REQ-PROTOCOL-F20, CP-PROTOCOL-06). The workspaces and tabs wait for the session layer.
Gates: a transaction with no RACI produces an exception, not a silent pass; the ledger row is written in the same transaction as the action; the score shows its components.

**Phase 5 — S5 Policy lifecycle, distribution, policy-to-protocol and the compliance dashboard.** Policy repository, versions and review (REQ-PROTOCOL-F21); applicability and acknowledgements (REQ-PROTOCOL-F22, §2.9 and §2.10); policy-requirement generator into drafts (REQ-PROTOCOL-F23); validation before activation (REQ-PROTOCOL-F24); administrator approval for critical items (REQ-PROTOCOL-F25, CP-PROTOCOL-05); policy exceptions and change-impact preview (REQ-PROTOCOL-F26); the dashboard data (REQ-PROTOCOL-F27).
Gates: procurement policy publication generates a draft workflow, an evidence rule and a checklist reference; a critical limit change waits for an administrator other than its maker and starts in OBSERVE; a critical validation conflict blocks activation.

**Standing rule for every phase.** Each phase is built, verified and reported on its own. A generated or configured control point never reaches WARN or ENFORCE without its OBSERVE report and approval. Text in a chat or a message has no protocol effect.

## 5. Reporting format (required for every phase)

1. **Phase and slice:** for example `Part 17 · S1`.
2. **Outcome:** one line: built, partly built, blocked, or planned only.
3. **Deliverables:** each with its file or route path and requirement id (REQ-PROTOCOL-Fxx or CP-PROTOCOL-xx).
4. **Assumptions and decisions:** new assumption ids (A-171 onward after this plan) and decision ids. Nothing is recorded as approved unless the owner approved it.
5. **Evidence:** the exact command and result for each gate: `npm run check:all` (x of 9), the named tests, the rollback result, the protocol test matrix, and the acceptance scenario results.
6. **Controls:** each CP-PROTOCOL control, its enforcement status and the test that proves it.
7. **Checks:** for each check in the library, whether it is built, or unavailable with its reason.
8. **Not built and why:** each item of the phase plan that is not done, with its reason.
9. **Owner items:** each question that needs the owner, with the minimum information needed to answer it.
10. **Next step:** the next phase, and whether it needs approval first.

## 6. Enhanced execution prompt for Part 17

Use the Part 17 specification and this discovery. Start from §2: no control point, threshold, reason code, weight or matrix value is assumed. In this order:

1. Confirm §2.1 (upstream approvals and session layer) and §2.2 (seeds). Build S1 only after they are answered or explicitly deferred.
2. Build each phase (§4) with tests and the rollback rehearsal. Run `check:all` on the staged tree. Report in the format of §5.
3. Keep one engine. Any second place that decides a gate, approves an exception or sets a mode is a defect to remove.
4. Never move a control point to WARN or ENFORCE without its OBSERVE report and an approval by someone other than the person who changed it.
5. Stop and report at each approval point. Ask only for what §2 names.
