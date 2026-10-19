# CONTROL_INVENTORY

Part 01, REQ-DISC-F08. Input to Part 17 (OBSERVE seeding).

**Result: no operational control exists in the repository.** There are no validations on business records, no limits, no approvals and no enforcement points, because there are no business records or workflows. The inventory is recorded as empty for every protocol stage (PLAN, VERIFY, APPROVE, EXECUTE, RECORD, MONITOR, RECONCILE, CLOSE). No control is claimed.

## What exists that is control-adjacent
| Item | Location | What it does | Is it a control? |
|---|---|---|---|
| Control-point identifier validator | `src/program/conventions.ts` | Checks the `CP-<CODE>-nn` format | No. It validates a name, not a transaction. |
| Dependency start rule | `src/program/index.ts` (`canStart`) | Blocks a Part until its dependencies are approved | No. It is a programme governance check, not a business control. |
| Design gate | `scripts/check-design.mjs` | Fails the design check on low contrast or raw colours | No. It is a development check. |
| Baseline check | `scripts/erp-program/baseline.ts` | Exits 1 on destructive change to golden outputs | No. It is a development check. |

## Gaps against Part 00 §9 (what must exist, none found)
- Protocol engine and `protocol.check` (N18, §9.2): absent.
- Exception record and approval chain (§9.3): absent.
- Threshold matrix (§9.4): absent. The seed values exist only in the constitution text.
- Mandatory evidence matrix (§9.5): absent.
- Maker-checker enforcement (§9.6): absent.
- Escalation ladder (§9.7): absent.
- Action ledger (§9.8): absent.
- Detection rules DR-01 to DR-34 (§9.9): absent.

## Leakage points
Not measurable. The leakage points listed in REQ-DISC-F08 (issue without requisition, PO without comparative statement, payment without match, MB without drawing, attendance without geo-fence) cannot exist until the modules that would hold them are built. The risk is recorded as a programme-level risk (R-07).
