# DB_EXTENSIONS (object register)

Part 03 §7.5. One row per object created by a migration. Columns: migration, object, type, purpose, reversible, back-fill, owner.

| Migration | Object | Type | Purpose | Reversible | Back-fill | Owner |
|---|---|---|---|---|---|---|
| 202610191200_dbf_sys_foundation | sys (schema) | schema | Technical schema | Yes | No | dbf |
| 202610191200_dbf_sys_foundation | sys.migration_runs | table | Migration register | Yes (dropped by its own down; see note) | No | dbf |
| 202610191200_dbf_sys_foundation | sys.reject_mutation() | function | Trigger body for append-only tables | Yes | No | dbf |
| 202610191200_dbf_sys_foundation | sys.enforce_append_only(regclass) | function | Attaches the append-only trigger | Yes | No | dbf |
| 202610191200_dbf_sys_foundation | sys.current_tenant_id(), sys.current_user_id() | functions | Tenant and user context (ADR-002) | Yes | No | dbf |
| 202610191200_dbf_sys_foundation | sys.enable_tenant_rls(regclass) | function | Tenant isolation policy template | Yes | No | dbf |
| 202610191200_dbf_sys_foundation | sys.create_monthly_partitions(regclass, integer) | function | Partitions ahead of time | Yes | No | dbf |
| 202610191200_dbf_sys_foundation | sys.mask_salt(), raise_mask_salt_missing(), sys.mask_bytes(), sys.hex_digits() | functions | Masking support; refuses without a salt | Yes | No | dbf |
| 202610191200_dbf_sys_foundation | sys.mask_pan, mask_phone, mask_email, mask_account | functions | Deterministic format-preserving masking (REQ-DBF-F13) | Yes | No | dbf |
| 202610191230_dbf_sys_operations | sys.idempotency_keys | table | Idempotency store (AC-4) | Yes | No | dbf |
| 202610191230_dbf_sys_operations | sys.outbox | table | Transactional outbox (AC-5) | Yes | No | dbf |
| 202610191230_dbf_sys_operations | sys.backfill_batches | table | Back-fill checkpoints | Yes | No | dbf |
| 202610191230_dbf_sys_operations | sys.integrity_invariants | table | Registered invariants | Yes | No | dbf |
| 202610191230_dbf_sys_operations | sys.integrity_snapshots | table, append-only | Row counts and checksums | Yes | No | dbf |
| 202610191230_dbf_sys_operations | sys.integrity_findings | table | Findings for owner modules | Yes | No | dbf |
| 202610191230_dbf_sys_operations | sys.acp_runs | table | Governed replacement runs | Yes | No | dbf |
| 202610191230_dbf_sys_operations | sys.acp_diffs | table, append-only | Parallel-run differences | Yes | No | dbf |
| 202610191230_dbf_sys_operations | sys.legacy_loads | table | Legacy load counts and sign-off | Yes | No | dbf |
| 202610191230_dbf_sys_operations | sys.is_effective(timestamptz, timestamptz, timestamptz) | function | Effective dating | Yes | No | dbf |

Note on the baseline down script: it drops `sys.migration_runs`, so the revert of the baseline itself cannot be recorded in the register. Revert the baseline only with `resetForTests` on a disposable database, or by a reviewed manual step recorded in CHANGELOG.md.

| 202610191300_core_shared_kernel | core_settings | table, append-only, RLS | Configuration versions with maker-checker | Yes | No | core |
| 202610191300_core_shared_kernel | core_number_series, core_number_allocations | table, RLS | Numbering counters and allocations | Yes | No | core |
| 202610191300_core_shared_kernel | core_audit_entries | table, append-only, RLS | Interim audit adapter; replaced by Part 08 | Yes | No | core |
| 202610191300_core_shared_kernel | core_action_ledger | table, append-only, RLS | Interim lifecycle ledger adapter; replaced by Part 17 | Yes | No | core |
| 202610191300_core_shared_kernel | core_protocol_evaluations | table, append-only, RLS | Interim protocol evaluation adapter; replaced by Part 17 | Yes | No | core |
| 202610191300_core_shared_kernel | core_jobs | table, RLS | Job queue | Yes | No | core |
| 202610191300_core_shared_kernel | core_holidays, core_financial_periods | table, RLS | Calendar data (API deferred, CF-028) | Yes | No | core |
| 202610191300_core_shared_kernel | core_sample_records | table, RLS | Reference table for the hidden sample module (deferred, CF-028) | Yes | No | core |
