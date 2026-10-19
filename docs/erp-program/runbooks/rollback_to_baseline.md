# Rollback to the baseline (repository level)

Part 01, REQ-DISC-F14. This runbook covers the repository. Database and object-storage restore are not applicable yet, because neither exists (see EXISTING_SYSTEM_MAP.md).

## When to use
A change after the baseline breaks a golden output, removes an artefact, or breaks the build, and the fix is not clear quickly.

## Steps
1. Identify the baseline tag: `erp-baseline-v0` (created on the baseline commit; see DECISIONS.md D-012).
2. Check the current state: `npm run baseline:check`. Note every destructive line.
3. Restore into a separate checkout, so the working tree is not overwritten:
   - `git worktree add ../erp-restore erp-baseline-v0`
   - `cd ../erp-restore && npm ci`
4. Verify the restore: `npm run baseline:check` and `npm test` must both pass with no destructive difference.
5. If the restore is the intended state, move the branch to the tag with a reviewed commit. Do not force-push a shared branch.
6. Record the rollback in `CHANGELOG.md` with the reason and the owner who approved it.

## Rehearsal log
| Date | Action | Result |
|---|---|---|
| 2026-10-19 | Clone of `erp-baseline-v0` into an isolated directory; `npm ci`; `npm run baseline:check`; `npm test` | Pass: zero differences; 132 tests pass (see `modules/disc/discovery.md`) |

## Database and storage (to be added by Part 03)
When a database exists, this runbook gains: a full backup, a restore into an isolated database, and an integrity-check comparison that must match 100 %.
