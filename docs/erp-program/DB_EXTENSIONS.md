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
| 202610191400_org_structure | org_legal_entities | table, RLS | Legal entities (PAN, TAN, approval) | Yes | No | org |
| 202610191400_org_structure | org_legal_entity_registrations | table, RLS | GSTIN and other registrations, effective-dated | Yes | No | org |
| 202610191400_org_structure | org_units | table, RLS | Hierarchy units (group to department) | Yes | No | org |
| 202610191400_org_structure | org_unit_history | table, RLS | Hierarchy change history, append-only | Yes | No | org |
| 202610191400_org_structure | org_cost_centres | table, RLS | Cost centres | Yes | No | org |
| 202610191400_org_structure | org_profit_centres | table, RLS | Profit centres | Yes | No | org |
| 202610191500_org_projects_sites | org_projects | table, RLS | Project master, lifecycle | Yes | No | org |
| 202610191500_org_projects_sites | org_sites | table, RLS | Site master, lifecycle | Yes | No | org |
| 202610191500_org_projects_sites | org_project_status_history | table, RLS | Project status history, append-only | Yes | No | org |
| 202610191500_org_projects_sites | org_project_templates | table, RLS | Project templates | Yes | No | org |
| 202610191500_org_projects_sites | org_cost_centres.project_id | column | Cost centre linked to a project | Yes | No | org |
| 202610191600_org_lbs_geofence_allocation | org_locations | table, RLS | Location breakdown (LBS) | Yes | No | org |
| 202610191600_org_lbs_geofence_allocation | org_site_geofences | table, RLS | Site geofence versions | Yes | No | org |
| 202610191600_org_lbs_geofence_allocation | org_project_allocations | table, RLS | Project allocations | Yes | No | org |
| 202610191600_org_lbs_geofence_allocation | org_user_contexts | table, RLS | Per-person pinned and recent contexts | Yes | No | org |
| 202610191700_iam_permissions | iam_permissions | table | Permission registry (global) | Yes | No | iam |
| 202610191700_iam_permissions | iam_roles | table | Roles | Yes | No | iam |
| 202610191700_iam_permissions | iam_role_permissions | table | Role grants, maker-checker | Yes | No | iam |
| 202610191700_iam_permissions | iam_user_role_assignments | table | Scoped role assignments, maker-checker | Yes | No | iam |
| 202610191700_iam_permissions | iam_authority_limits | table | Approval authority limits | Yes | No | iam |
| 202610191700_iam_permissions | iam_field_policies | table | Field-level view and mask policies (global) | Yes | No | iam |
| 202610191800_iam_sod | iam_sod_rules | table, RLS | SoD rules and lifecycle | Yes | No | iam |
| 202610191800_iam_sod | iam_action_log | table, RLS | Action log for SoD, append-only | Yes | No | iam |
| 202610191800_iam_sod | iam_actor_links | table, RLS | Linked accounts for one person | Yes | No | iam |
| 202610191800_iam_sod | iam_sod_exceptions | table, RLS | SoD exceptions, time-boxed | Yes | No | iam |
| 202610191800_iam_sod | iam_sod_findings | table, RLS | SoD findings, append-only | Yes | No | iam |
| 202610191850_iam_authentication | iam_credentials | table, RLS | Password hashes, lockout, last login | Yes | No | iam |
| 202610191850_iam_authentication | iam_password_resets | table, RLS | Reset tokens (hashed), single use | Yes | No | iam |
| 202610191850_iam_authentication | iam_devices | table, RLS | Devices with trust level and revocation | Yes | No | iam |
| 202610191850_iam_authentication | iam_sessions | table, RLS | Sessions with rotating refresh tokens | Yes | No | iam |
| 202610191850_iam_authentication | iam_mfa_factors | table, RLS | TOTP factors (encrypted secret) | Yes | No | iam |
| 202610191900_iam_privileged_reviews | iam_elevations | table, RLS | Privileged elevations, time-boxed | Yes | No | iam |
| 202610191900_iam_privileged_reviews | iam_revocations | table, RLS | Person revocations (leavers) | Yes | No | iam |
| 202610191900_iam_privileged_reviews | iam_access_reviews | table, RLS | Access review campaigns | Yes | No | iam |
| 202610191900_iam_privileged_reviews | iam_access_review_items | table, RLS | Review items and decisions | Yes | No | iam |
| 202610191900_iam_privileged_reviews | iam_export_rules | table, RLS | Export rules per report | Yes | No | iam |
| 202610191900_iam_privileged_reviews | iam_export_events | table, RLS | Export decisions, append-only | Yes | No | iam |
| 202610191900_iam_privileged_reviews | iam_shadow_comparisons | table, RLS | Shadow comparisons, append-only | Yes | No | iam |
| 202610191900_iam_privileged_reviews | iam_user_role_assignments.revoked_at | column | Immediate revocation of a role assignment | Yes | No | iam |
| 202610191950_iam_step_up | iam_sessions.mfa_verified_at | column | Time of the last second factor on a session | Yes | No | iam |
| 202610192000_secgov_audit_chain | sec_audit_log | table, append-only, RLS | Audit chain (hash-linked per tenant) | Yes | No | secgov |
| 202610192000_secgov_audit_chain | sec_sensitive_reads | table, append-only, RLS | Sensitive field reads | Yes | No | secgov |
| 202610192100_secgov_security_events | sec_login_history | table, append-only, RLS | Login outcomes, append-only | Yes | No | secgov |
| 202610192100_secgov_security_events | sec_security_events | table, append-only, RLS | Security events raised by rules, append-only | Yes | No | secgov |
| 202610192100_secgov_security_events | sec_security_event_status | table, append-only, RLS | Event status history, append-only | Yes | No | secgov |
| 202610192200_auth_users | auth_id_series | table, RLS | Gap-free User ID sequence per company | Yes | No | auth |
| 202610192200_auth_users | auth_users | table, RLS | Users, User IDs, account states, validity dates | Yes | No | auth |
| 202610192200_auth_users | auth_password_history | table, append-only, RLS | Previous password hashes (last five are checked) | Yes | No | auth |
| 202610192300_evbus_envelope_inbox | sys.outbox (columns aggregate_key, correlation_id, causation_id) | table alteration, additive | Event envelope fields on the outbox | Yes | No | evbus |
| 202610192300_evbus_envelope_inbox | evt_inbox | table, RLS, append-only | Consumer inbox: one row per consumer and event | Yes | No | evbus |
| 202610192400_intg_connectors | intg_connectors | table, RLS | Connectors: code, type, status, allow-list, failure counters | Yes | No | intg |
| 202610192400_intg_connectors | intg_credentials_ref | table, RLS | Secret versions, AES-256-GCM ciphertext, maker-checker state | Yes | No | intg |
| 202610192400_intg_connectors | intg_mappings | table, RLS | Versioned ERP-to-external code mappings | Yes | No | intg |
| 202610192400_intg_connectors | intg_messages | table, RLS | One row per call attempt (outcome, timing, payload hash) | Yes | No | intg |
| 202610192400_intg_connectors | intg_dlq | table, RLS | Dead-letter entries for failed messages (replay in S2) | Yes | No | intg |
| 202610192500_ds_branding | ui_branding | table, RLS | Tenant brand versions: two colours, logo reference, contrast report, approval | Yes | No | ds |
| 202610192600_ds_user_preferences | ui_user_preferences | table, RLS | Per-user theme, density, collapsed flag and pinned routes (max 10) | Yes | No | ds |
| 202610192700_dash_spaces | ui_role_spaces | table, RLS | Versioned role spaces (widget codes per role; one active per role) | Yes | No | dash |
| 202610192700_dash_spaces | ui_user_space_overrides | table, RLS | A person's own widget arrangement | Yes | No | dash |
