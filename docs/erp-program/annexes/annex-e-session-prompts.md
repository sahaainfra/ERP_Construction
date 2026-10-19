# PART 00 — ANNEX E: SESSION PROMPTS (copy, fill, paste)

Use one session per Part (or per delivery slice of a large Part). Attach: `P00_PROGRAM_CONSTITUTION.md`, the Part file, and only the annex sections the Part cites.

---

## E1 Kick-off prompt (one per Part or slice) — Claude Haiku 5.5 format

Paste the three documents first (constitution, Part file, cited annex sections), each wrapped in its own tag, then this prompt. XML tags keep Haiku's attention on the right source; the numbered steps and stop conditions keep the session bounded.

```text
<context>
  <constitution>…P00_PROGRAM_CONSTITUTION.md…</constitution>
  <part>…PART_<NN>_….md…</part>
  <annex_sections>…only the sections listed under "Context load" in the Part header…</annex_sections>
</context>

<task>
Execute PART <NN> — <TITLE>, slice <S#>, module code <code>, default mode <BUILD | EXTEND | VERIFY & EXTEND>.
Repository: <repo path or link>. Previous session notes: docs/erp-program/modules/<code>/session-notes.md (read first if present).
</task>

<steps>
1. Definition of Ready (§5.1): list each dependency Part with its audit-record link. Any missing → STOP and report.
2. Discovery (§5.2) for this slice only: search code and DB for the Part's keywords and legacy aliases. Output the Discovery summary table.
3. Impact sheet (§5.3): answer the fifteen questions briefly.
4. Plan (§5.4): numbered lists. If any REPLACE decision, destructive change or conflict exists → STOP after the plan and wait for "proceed".
5. Implement in the §5.5 order. Write failing tests first for formulas, control points and invariants.
6. Verify: universal test gate (§10.2), the Part's acceptance scenarios for this slice, regression (§5.7).
7. Self-check (§13.4), then output the completion report (E2) — or the hand-over report (E8) if context nears 70,000 tokens.
</steps>

<rules>
Part 00 wins over the Part. Never break existing behaviour, invent data, compute business values outside Part 22, bypass permissions or controls, or mark work complete without evidence. Copy identifiers exactly. Unclear or conflicting → CONFLICTS.md, skip that item, continue the rest, report it.
</rules>
```

### E1-legacy Plain-text kick-off (for agents that do not use XML tags)

```text
You are executing PART <NN> — <TITLE> (module code <code>, slice <S#/all>) of the Construction ERP program.
Governing document: Part 00 constitution (attached). It wins over the Part on any conflict.
Execution mode declared by the Part: <BUILD | EXTEND | VERIFY & EXTEND>. Confirm or change it after discovery and record why.

Before writing code:
1. Definition of Ready (Part 00 §5.1): confirm every dependency Part <list> is APPROVED (link audit records). If not, STOP and report.
2. Discovery (§5.2): search code and DB for the Part's keywords and legacy aliases; write docs/erp-program/modules/<code>/discovery.md with REUSE/EXTEND/NEW/REPLACE decisions.
3. Impact sheet (§5.3): answer the fifteen questions in modules/<code>/impact.md.
4. Plan (§5.4): slices, migrations, APIs, events, permissions, control points, screens, tests, adapters, rollback.
Show me the discovery summary, the impact summary and the plan; wait for "proceed" if any REPLACE decision, destructive change, or conflict exists — otherwise proceed.

While building: follow §5.5 order, universal requirements U1–U20 (§12.2), additive migrations (§7), controls in OBSERVE for legacy flows, feature flag ff.<code> OFF in production.
Finish with: universal test gate (§10.2), the Part's acceptance scenarios, regression check (§5.7), traceability.csv at 100 %, audit record draft (§5.8), completion report (E2).
Never: break existing behaviour, invent data, compute business values outside Part 22, bypass permissions/controls, or mark complete without evidence.
```

## E2 Completion report (agent → owner)

```text
PART <NN> — <TITLE> — COMPLETION REPORT
Mode used: … (changed from …? why)
Delivered requirements: REQ-<CODE>-F01 … Fnn → status (done / deferred → Part NN, reason)
Discovery decisions: REUSE n · EXTEND n · NEW n · REPLACE n (ADR links)
Migrations: list (object, type, reversible Y/N, back-fill) — schema diff on pre-existing tables: EMPTY / approved ACP step
APIs (new/changed versions) · Events · Permissions · Control points (mode) · Workflows · Reports/prints · Widgets · Navigation entries
Adapters in place (engine → removing Part)
Tests: unit / integration / contract / permission / SoD / protocol matrix / UI breakpoints / a11y / visual / offline / security / performance — pass counts and links
Regression: existing suite, golden outputs, earlier Parts — result and links
Open findings: id · severity · owner · target
Rollback: rehearsed (date, result)
Ready for audit: yes/no
```

## E3 Independent audit prompt (mandatory for High-risk Parts)

```text
You are an independent reviewer. You did not write this code.
Audit PART <NN> (<code>) against Part 00 §5.8 dimensions AUD-1…AUD-18, the Part's acceptance criteria and U1–U20.
Inputs: completion report, traceability.csv, gate report, diff of the change set, evidence folder.
For each AUD dimension: PASS / FAIL / N/A with evidence link. Probe at least: one IDOR attempt per new resource, one SoD violation, one control bypass via import/API/job, one offline conflict (if field), one money/quantity recomputation against Part 22 golden tests, one migration rollback.
Output docs/erp-program/modules/<code>/audit.md with findings (severity, description, reproduction, fix recommendation). Do not fix code yourself.
```

## E4 Phase gate prompt (end of each phase)

```text
Phase <n> — <name> gate.
Confirm for every Part in the phase: APPROVED audit record, traceability 100 %, adapters list, feature-flag state.
Run the cross-Part integration scenarios relevant to this phase (Part 82 catalogue, those already automatable), full regression, DB integrity invariants (§7.6), performance smoke on the volume dataset.
Report: phase exit criteria met / not met, risks carried forward, adapters still open with their removing Part, decisions needed from the owner.
```

## E5 Regression-fix prompt

```text
A regression was detected: <test/golden output/report> failed after PART <NN>.
Find the root cause (not the symptom). Fix with the smallest compatible change. Add a test that fails before and passes after.
Re-run the full regression and the gate of every Part whose code you touched. Update the audit records whose approval this invalidates.
Report cause, fix, tests, evidence.
```

## E6 VERIFY & EXTEND prompt (for Parts built under the old pack)

```text
PART <NN> consolidates legacy prompts <old ids> (Annex D), reported built.
1. Locate the legacy implementation, gate reports and audit records (old paths test-evidence/part-NNN, audit/part-NNN.md).
2. Run this Part's acceptance scenarios and U1–U20 against the existing implementation; produce gap.md (requirement → present / partial / absent, evidence).
3. Implement only partial/absent items; do not rebuild working functionality; keep legacy module codes, permission keys, routes and events (aliases in Annex D).
4. Re-run the gate; write the new audit record referencing the legacy one.
```

## E7 Architecture & Database Change Path prompt (REPLACE decisions only)

```text
Discovery recommends REPLACE for <component> under PART <NN>.
Write ADR-<nnn> per Part 00 §7.4: problem, which §7.3 criteria are met (with evidence), options, decision, data mapping, risks, rollback triggers and owners, schedule avoiding period close.
Do not execute any step until the ADR is approved. Then execute one ACP step per session: expand → migrate (reconciliation report) → parallel run (difference report) → cut-over (runbook, rollback rehearsal) → contract (after stability window and written approval).
```

## E8 Hand-over report (session ends before the slice is complete)

```text
PART <NN> — <TITLE> — SLICE <S#> — HAND-OVER
Context used: ~<n> tokens (reason for hand-over)
Done in this session: items with file paths and test IDs
In progress: item → file:line, what remains, exact next command/test to run
Not started: items
Decisions made (DECISIONS.md ids) · Conflicts raised (CONFLICTS.md ids)
Open questions for the owner
session-notes.md updated: yes (path)
Next session must load: constitution, this Part, annex sections <list>, session-notes.md, plan.md
```

## E9 Session sizing guide (Claude Haiku 5.5)

| Situation | What to do |
|---|---|
| Slice touches > 15 files or > 4 new tables | Split the slice (S2a/S2b) in `plan.md` before coding |
| Discovery finds a large legacy module | Write the file map to `session-notes.md`; implement in the next session |
| Tool output is long (logs, test runs) | Keep only failures and counts; summarise the rest |
| A dependency is not live | Build the documented adapter, record it, continue |
| Context ≈ 70,000 tokens | Stop, write notes, issue E8 |
