# Schema baseline review (REQ-DBF-F01)

Database: PostgreSQL 16.15 (local cluster `main`, port 5432). Schema reviewed: `sys` (technical), created by migrations `202610191200_dbf_sys_foundation` and `202610191230_dbf_sys_operations`. Method: catalog queries on `erp_dev` (tables, columns, keys, indexes, triggers, functions), the linter in `src/db/migrations.ts`, and the integration tests.

## Inventory
| Object | Columns | Primary key | Foreign keys | Indexes | Append-only | Owner |
|---|---|---|---|---|---|---|
| sys.migration_runs | 14 | id | 0 | 2 | No (finding F-03) | dbf |
| sys.idempotency_keys | 7 | scope, idem_key | 0 | 2 | No | dbf |
| sys.outbox | 10 | id | 0 | 3 | No | dbf |
| sys.backfill_batches | 13 | job_code, batch_no | 0 | 1 | No | dbf |
| sys.integrity_invariants | 6 | code | 0 | 1 | No | dbf |
| sys.integrity_snapshots | 8 | id | 0 | 1 | Yes (trigger) | dbf |
| sys.integrity_findings | 9 | id | 1 (invariant_code) | 2 | No (findings update) | dbf |
| sys.acp_runs | 10 | id | 0 | 1 | No | dbf |
| sys.acp_diffs | 7 | id | 1 (acp_run_id) | 1 | Yes (trigger) | dbf |
| sys.legacy_loads | 12 | id | 0 | 2 | No | dbf |

Functions: 14 in `sys` (tenant context, RLS template, append-only guard, monthly partitions, effective dating, deterministic masking). No business tables exist, so no business money or quantity column exists. Money-named columns in this schema: none.

## Findings
Severity follows Part 00 §5.8. Each finding has a remedy that does not destroy data. None is blocking for the baseline; each is scheduled.

| ID | Severity | Finding | Remedy | Owner | Target |
|---|---|---|---|---|---|
| F-01 | High | `sys.integrity_invariants.sql_text` holds SQL that `runInvariants` executes. Anyone able to write this table could run arbitrary SQL with the migrator's rights. | The application role has no privilege on the table (confirmed by test). Run invariants on a dedicated read-only role in the scheduled job (Part 84 window). Writes to the table only through migrations. | Security architect, DBA | Before the first invariant is registered by a module |
| F-02 | Medium | `sys.idempotency_keys` and `sys.outbox` grow without limit. Expired idempotency keys are removed only when the same key is seen again. | Scheduled retention job: delete expired keys and published outbox rows older than the retention period in Part 84. | DBA | Part 84 |
| F-03 | Medium | `sys.migration_runs` is not append-only. Rows are inserted by the runner but nothing prevents an update or delete. | Add `sys.enforce_append_only('sys.migration_runs')` in a new migration. This blocks update and delete for every role. | DBA | Next migration |
| F-04 | Low | `sys.migration_runs.error_summary` and `sys.outbox.last_error` are unbounded text. The runner truncates to 500 characters, but the column allows more. | Add CHECK (length(...) <= 2000) in a new migration. | DBA | Next migration |
| F-05 | Low | `sys.outbox` has no index on `tenant_id`. Tenant-scoped relay or replay will scan. | Add the index when tenant-scoped replay is built (Part 10). Adding it now would cost write time for no query. | DBA | Part 10 |
| F-06 | Medium | No back-fill job, integrity snapshot or invariant is scheduled. Integrity is checked only when a person runs it. | Schedule `runInvariants` and a snapshot per table in the job framework (Part 05). Until then, run by hand and record. | Technical lead | Part 05 |
| F-07 | Info | `sys.backfill_batches` has no foreign key to a job table, because no job table exists. Job codes are checked by pattern only. | Accept until Part 05 defines the job register. | DBA | Part 05 |
| F-08 | Info | The dev database was initialised once by hand, then reset to the registry-managed state. This is recorded because it is a deviation from the rule that the migration runner is the only way to change the schema. | Recorded in CHANGELOG.md. Do not repeat. | Technical lead | Done |

## Checks passed
- Every table has a primary key. Every foreign key targets a primary key.
- Every migration has an up and a down script, and passes the linter (naming, module code, destructive statements, float money, NOT NULL without default).
- Checksums of applied migrations match the files.
- The up, down, up round trip keeps the schema fingerprint identical (integration test).
- The application role cannot create objects in `sys` (integration test).
- Tenant isolation: a tenant reads only its own rows, and a write for another tenant is rejected (integration test).
- Masked copy contains none of the source values (integration test).
- Restore of a dump into a separate database matches every `sys` table row by row (`npm run db:restore-check`).

## Index usage
No query statistics exist yet (no production workload). The indexes listed above are primary keys, unique constraints, and the partial and expression indexes written in the migrations. Unused-index review starts with `pg_stat_user_indexes` once the workload runs (REQ-DBF-F14, Part 84 window).
