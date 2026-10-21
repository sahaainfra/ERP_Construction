# Database developer guide (REQ-DBF-F16)

Applies to every module. Conventions come from Part 00 §7.2. The standards are enforced by the migration linter and the integration tests.

## 1. Two database roles
| Role | Rights | Used by |
|---|---|---|
| `erp_migrator` | Owns the schema, runs DDL | Migration commands, maintenance scripts only (`MIGRATOR_DATABASE_URL`) |
| `erp_app` | DML on granted tables, no DDL, no superuser | The running server (`APP_DATABASE_URL`) |

Grant the application role only what a table needs. Never give it DDL, and never let it own a table.

## 2. Writing a migration
1. Name the file `<yyyymmddhhmm>_<code>_<description>.up.sql` and `.down.sql`. `<code>` is the module code from Annex C.
2. Write the down script. It removes only what the up script created.
3. Run `npm run db:lint`. It must report 0 violations.
4. Run `npm run db:dry-run`. All pending migrations run in one transaction that is rolled back, with timings.
5. Apply with `npm run db:migrate`. Confirm with `npm run db:status`.

Destructive statements (DROP, TRUNCATE, DELETE FROM, RENAME, column type change) are rejected unless the file starts with an approved ACP header:
```sql
-- acp: ADR-004 step contract
```
Money and quantity columns use `NUMERIC` (DECIMAL). `REAL`, `DOUBLE PRECISION` and `FLOAT` are rejected on money-named columns (AC-7). `ADD COLUMN ... NOT NULL` needs a DEFAULT. `SET NOT NULL` on an existing column is rejected: use a validated CHECK instead.

## 3. Transactions
Every business write uses `withTransaction` (`src/db/transactions.ts`):
- Isolation defaults to READ COMMITTED. Use SERIALIZABLE, or explicit row locks, for numbering, stock and balance updates.
- A statement timeout applies to every transaction.
- Serialisation failures and deadlocks are retried with jitter.
- Pass `tenantId` and `userId`. They are set for the transaction only, and row-level security reads them.

## 4. Idempotency and events
- Every financial, stock, approval, posting, payment and offline-sync write takes an `Idempotency-Key` and runs through `executeIdempotent` (`src/db/idempotency.ts`). A repeated request returns the stored response. A reused key with a different body is rejected.
- Events are written with `enqueueEvent` inside the business transaction (`src/db/outbox.ts`). Event types follow `<code>.<entity>.<past_tense_verb>`. The relay publishes with `relayBatch`. Consumers must be idempotent.

## 5. Versioning and effective dating
- Versioned masters: keep `valid_from` and `valid_to` (`timestamptz`, NULL means open). Use `sys.is_effective(valid_from, valid_to, at)` to select the version in force.
- Closed periods: write an immutable snapshot. Do not update it.

## 6. Partitions
High-volume tables (audit, events, stock ledger, attendance punches, telematics, notifications) are range-partitioned by time. Create partitions ahead with `SELECT sys.create_monthly_partitions('<parent>'::regclass, 3)`. The function is idempotent. A scheduled job calls it (Part 05).

## 7. Tenant isolation
Each tenant-scoped table has `tenant_id uuid NOT NULL`. Enable the policy with `SELECT sys.enable_tenant_rls('<table>'::regclass)`. Then grant the application role only the DML it needs. The policy is forced on the owner too.

## 8. Append-only tables
Audit and history tables call `sys.enforce_append_only('<table>'::regclass)`. The trigger rejects UPDATE and DELETE for every role. Corrections are new rows.

## 9. Back-fill
Use `runBackfill` (`src/db/backfill.ts`). Write a job with a `batch(client, fromKey, toKey)` function that returns checksums computed on both sides for the same key range. Each batch commits only when the checksums match. Stop with `maxBatches` or the kill switch. Resume by running it again. Rehearse on a production-sized copy before the run (`npm run db:backfill-rehearsal` shows the pattern).

## 10. Masking for non-production copies
Set `sys.mask_salt` to a per-environment secret for the session or transaction. Masking refuses to run without it. Use `sys.mask_pan`, `sys.mask_phone`, `sys.mask_email` and `sys.mask_account`. Never copy a salt between environments.

## 11. What not to do
- Do not write ad-hoc SQL against business data. Corrections go through the owning module as new or reversing records (Part 03 §7).
- Do not edit an applied migration. Add a new one. The runner refuses changed files.
- Do not use `SELECT *` in application code. Name the columns.
- Do not build SQL by string concatenation with user input. Use parameters. Identifiers come only from code, through `quoteIdent`.
