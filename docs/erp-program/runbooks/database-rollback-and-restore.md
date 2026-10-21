# Database rollback, backup and restore (Part 03 REQ-DBF-F12)

## Before any production migration batch or ACP step
1. `npm run db:lint` and `npm run db:dry-run` pass on a production-sized copy.
2. Take a backup: `npm run db:backup` (writes a custom-format dump to `backups/`). For production, the backup runs from the managed service and is verified by restore (step 4).
3. Note the current `npm run db:status` output.

## Reverting one migration
`npm run db:down -- 1` reverts the most recent migration. It refuses to run if an applied migration's file has changed. Revert only migrations that have not been used by data written after them. Otherwise add a correcting migration.

## Restore into a separate database
`npm run db:restore-check` dumps the migrator database, restores the dump into `erp_restore_check`, compares every `sys` table row by row, and drops the copy. It exits non-zero on any difference.

For a real recovery, restore to a new database, verify with the same comparison, and then switch the application's `APP_DATABASE_URL`. Never restore over the live database without an incident record and a second approver.

## Measured for the local database (2026-10-19)
| Measure | Value |
|---|---|
| Dump size | about 35 KB (`sys` schema only) |
| Dump time | about 150 ms |
| Restore time | about 140 ms |
| Verification | 10 tables compared, 0 differences |

These figures are for an almost empty database. They are not an RTO for production. Measure RTO on a production-sized copy before go-live.

## Point-in-time recovery
Not configured in this environment. The local cluster has no WAL archive, so point-in-time recovery to an arbitrary timestamp has not been tested. This is open as CF-016. Production needs WAL archiving and a restore drill to a chosen time (Part 84).
