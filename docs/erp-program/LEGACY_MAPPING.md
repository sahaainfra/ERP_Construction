# LEGACY_MAPPING

Summary of the legacy crosswalk (Annex D, §14 step 2). The full crosswalk is in `LEGACY_CROSSWALK.csv` (167 rows, one per old prompt 00–166). The lookup module is `src/program/legacy.ts`.

## Counts
| Item | Count |
|---|---|
| Old prompts mapped (00–166) | 167 |
| Parts that start in VERIFY & EXTEND (Annex D2) | 21 |
| Consolidations (Annex D3) | 51 |
| Module-code alias rows (Annex D4) | 60 |
| Plant module rows (D6) | 34 |
| WorkChat module rows (D7) | 27 |

## Status
- **Legacy evidence is not in this repository** (CF-001). The VERIFY & EXTEND mode is recorded, but no legacy implementation, gate report or audit record has been checked. Each VERIFY & EXTEND Part needs that check (Annex E6) before it can start.
- **Aliases** (`D4`) keep every legacy permission key, route, event and table name. Built identifiers are never renamed.
- **Run plan (D1)** is recorded here and not executed. Step 1 (adopt Part 00) is done, pending owner signature. Steps 2–5 wait for CF-001.

## VERIFY & EXTEND Parts (Annex D2)
01, 04, 05, 06, 07, 08, 08A, 09, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 25, 25A, 25C.

## Related
- `CONFLICTS.md` CF-001 and CF-002.
- `PROGRESS_REGISTER.csv`: each Part's default and start mode, and its legacy prompts.
