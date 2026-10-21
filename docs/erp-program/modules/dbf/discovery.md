# Part 03 discovery and delivery record

Module `dbf`. Part 03 — Database Foundation, Schema Evolution & Data Migration Framework. Status: **APPROVED by the owner 2026-10-19 (D-033)**. Open items CF-016 and CF-018 are deferred, not delivered. The dependencies (Parts 01 and 02) are not yet APPROVED (CF-011), so this Part runs under the same caveat as Part 02.

## Discovery (REQ-DBF-F01 input)
- Keywords and legacy aliases searched: migrations folder, ORM migration tool, seeders, `schema_migrations`, triggers, stored procedures, sequences, backup scripts, replication, `pg_stat_statements`. Result: none exist in the repository. The Part 01 inventory recorded the database searches as empty.
- Old prompt 42 (former database foundation, not built) is therefore built here, as Annex D says.
- Decision: no existing migration tool to reuse. A small runner was written (`src/db/migrator.ts`). It covers up, down, status and dry-run, a checksum guard, a single-runner lock, and per-migration timeouts. An ORM was not added (CP-ARCH-01; ADR-001 and ADR-003 are PROPOSED).
- Database: PostgreSQL 16.15, from the local cluster `main`. Version 15 or later is required by the constitution (AC-3).

## Delivery against the slices (§18)
| Slice | Status | Evidence |
|---|---|---|
| S1 Baseline, review, conventions, DB guide | Done | `modules/dbf/schema-review.md`, `DB_GUIDE.md`, `DB_EXTENSIONS.md` |
| S2 Migration framework and CI rules | Done | `src/db/migrations.ts`, `src/db/migrator.ts`, `scripts/db/migrate.ts`; 18 lint tests; migration round trip test |
| S3 Back-fill, integrity and invariants | Done | `src/db/backfill.ts`, `src/db/integrity.ts`; 1,000,000-row rehearsal; invariant tests |
| S4 Transaction, idempotency, outbox, versioning, partitioning | Done | `src/db/transactions.ts`, `idempotency.ts`, `outbox.ts`; partition and effective-dating tests |
| S5 ACP toolkit | Partly done | ACP state machine and tables (`sys.acp_runs`, `sys.acp_diffs`); the expand, dual-write and comparator steps are not built, because no legacy structure exists to replace (CF-016) |
| S6 Backup, PITR, masking, legacy-load toolkit, security baseline | Partly done | Restore check and masking done; legacy-load state machine and table done, loader not built; PITR not configured (CF-016) |

## Acceptance (Part 03 §17)
| Criterion | Result |
|---|---|
| Schema baseline and review committed; every finding has a remedy | Done (8 findings, each with a remedy) |
| Destructive migration rejected by CI; valid migration runs up, down, up with the same schema fingerprint | Lint rejects destructive statements (tests). Up, down, up keeps the fingerprint (integration test) |
| 1 M-row back-fill resumes after forced stop and reconciles exactly | Done: 30 batches, stop, 70 batches, exact match, about 8 s total (`npm run db:backfill-rehearsal`) |
| ACP rehearsal on a sample table | Not done. No legacy table exists to replace. The state machine and difference table are tested. |
| Pilot legacy load reconciled, signed off, certificate generated | Not done. No legacy data exists. The state machine and table are tested. |
| PITR restore to a chosen timestamp within target RTO | Not done (CF-016). A dump restore is verified instead. |
| RLS harness proves zero cross-tenant leakage | Done (integration tests: read, no-context read, cross-tenant write) |
| Masked refresh contains no real identifiers (scanner) | Done for a synthetic copy (integration test). No production data exists to refresh. |

## Controls (§8)
| CP | Result |
|---|---|
| CP-DBF-01 Migration has up, down, dry run, reconciliation plan, approver ≠ author | Up, down and dry run enforced. Approver field is recorded in the register. Approver ≠ author is not enforced yet: needs the workflow (Part 16). |
| CP-DBF-02 Schema diff of pre-existing objects empty | Enforced for `sys` by the round-trip test. No pre-existing business objects exist. |
| CP-DBF-03 Back-fills reconcile before cut-over | Enforced per batch (checksums). |
| CP-DBF-04 Index on existing table needs plan evidence and DBA approval | State machine built; no index proposal workflow yet. |
| CP-DBF-05 ACP step needs approved ADR, fresh backup, outside close window | Backup command exists; ADR and calendar checks not built. |
| CP-DBF-06 Integrity findings monitored | Findings recorded; the scheduled job waits for Part 05 (F-06). |
| CP-DBF-07 Cross-tenant RLS tests return zero rows | Done in the integration suite. |

## Open items
CF-015 (dependency on Parts 01 and 02), CF-016 (point-in-time recovery and ACP and legacy evidence not available), CF-017 (technical API and Technical Console screens deferred to Parts 05, 07 and 12). The findings in `schema-review.md` are scheduled.
