# GOLDEN_OUTPUTS

Part 01, REQ-DISC-F12 and F13. Golden baseline for this repository.

## Contents
- `baseline.json`: the captured baseline. Two parts:
  - `cases`: 54 golden outputs. Each formula in `src/domain/` (42 functions) has a case with fixed inputs, plus programme invariants, a rendered session prompt (as a hash) and the §1.3 conventions.
  - `artifacts`: sha256 of 20 files whose content is part of the baseline (the annexes, the constitution as adopted, the design tokens, the generated programme data and the domain modules).

## Commands
- `npm run baseline:capture` writes `baseline.json` from the current repository. Run it only after a change is reviewed.
- `npm run baseline:check` compares the repository with the baseline and exits 1 when a difference is destructive.

## What counts as destructive
- A golden output that changes (N4: a number users rely on must not change silently).
- A removed golden case, or a removed artefact.

Additions (a new golden case, a new artefact) are additive. A changed artefact hash is reported for review and does not fail the check, because an intended change to a document or generated file should not block the gate.

## Determinism
Captured twice on the same commit, the output is identical. The check pins the time zone to Asia/Kolkata (AC-7) so date results do not depend on the machine. A test asserts that the golden values are identical across two runs.

## Not covered (see RISK_REGISTER R-08)
Database schema and data, API responses, report outputs, screen snapshots and load. These need Parts 03, 04 and later.
