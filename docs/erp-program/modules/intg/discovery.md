# Part 11 — Integration platform, API gateway and developer portal: discovery, plan and execution prompt

Status: **discovery and plan only. No code.** Part 11 is not yet approved by the owner (Part 00 §1.2). Build of slice S1 waits for that approval. Risk is High, so an independent human review is mandatory (Part 00 §5.8).

Dependencies (Part 00 §1.2): Part 07 (approved with conditions, D-054), Part 08 (approved, D-058), Part 10 (approved, D-063). All three are met. Part 10 S1 is built and pending owner approval; Part 11 S3 and S5 rely on Part 10 S2 to S5 (registry, webhooks, notifications), so those slices wait for them.

## 1. Discovery summary

| Area | Present | Where | Gap against Part 11 |
|---|---|---|---|
| Outbound calls | None. No code calls an external host | `src` (search for `fetch(` and `https://`) | Full gap. Nothing to wrap as a first adapter (Part 11 §15 has no legacy integrations to carry over) |
| Architecture decision | ADR-005 (accepted, D-038): an in-application versioned API under `/api/v<major>/` behind an ingress proxy; connectors in an integration service with a vault, backoff, breakers and a DLQ; devices through an edge ingestion service; government calls only through Part 27 | `docs/erp-program/adr/ADR-005.md` | Decision is made. No dedicated gateway product (A-57). Consistent with this plan |
| API routes | Health routes only (`/api/v1/health`, `/health/live`, `/health/ready`) | `src/app/api/v1/health` | Gateway, auth on API routes, quotas, audit and OpenAPI are full gaps (REQ-INTG-F04, F07) |
| Route registry | Every route file has a registry entry with a permission key or a public reason; checked in CI | `src/iam/routes.ts`, `scripts/iam/route-check.ts` | Reusable as the source for the OpenAPI document and the permission mapping (REQ-INTG-F04) |
| Authentication for machines | Part 07 tokens (HS256, pinned header, session-backed); service principals in `servicePrincipalContext` | `src/iam/crypto.ts`, `src/iam/auth.ts`, `src/core/context.ts` | Client-credentials flow and client registry not built. Service principals have a fixed permission list, which suits system clients (REQ-INTG-F05) |
| Rate limits | Token buckets per tenant and subject (`TokenBuckets`, `nsKey`) | `src/core/rate-limit.ts` | Not wired to any route. Usable for client quotas (A-61) |
| Credential handling | AES-256-GCM `encryptSecret`/`decryptSecret` keyed from `MFA_ENCRYPTION_KEY` (32-byte base64) | `src/iam/crypto.ts` | Usable as an interim vault (A-58). No vault product; no rotation or maker-checker for credentials |
| Idempotency | Idempotency store for requests (`IDEMPOTENCY_*` codes) | `src/db/idempotency.ts`, `src/core/idempotency.ts` | Reusable for API writes and bulk jobs (REQ-INTG-F06) |
| Retries and jobs | Database job queue with backoff (30 s doubling, one-hour cap) and dead state | `src/core/jobs.ts` | Reusable for connector retries and DLQ-style dead jobs. No DLQ table, replay or per-connector breaker |
| Events | Outbox, inbox and broker interface (Part 10 S1, pending approval) | `src/evbus/*`, `db/migrations/202610192300_evbus_envelope_inbox` | Device and connector events publish through it (REQ-INTG-F10). Registry, DLQ and webhooks are Part 10 S2 |
| Audit | Hash-chained audit with `writeAudit` (Part 08 S1) | `src/secgov/audit.ts` | API audit (REQ-INTG-F07) has its own partitioned table; it should also write to the chain for privileged client actions |
| Telemetry | Route spans, metrics and correlation (Part 09 S1) | `src/obs/*` | Per-connector metrics reuse the same counters (REQ-INTG-F01) |
| Resilience | Part 09 S4 (timeouts, retries with jitter, breakers, bulkheads) is not built | — | Connector breakers and timeouts depend on it (see §2.1) |
| Mapping data | None | — | Full gap (REQ-INTG-F03) |
| Devices | None. No device, weighbridge, batching plant or telematics code | — | Full gap (REQ-INTG-F10, F18). No hardware is available to test against (see §2.3) |
| Files and SFTP | None. No SFTP, PGP, MT940 or CAMT code | — | Full gap (REQ-INTG-F11). Libraries need ADRs (§2.8) |
| Scheduling interop | None. Part 38 is not built | — | Full gap (REQ-INTG-F12); contract tests only until Part 38 exists |
| Developer portal | None | — | Full gap (REQ-INTG-F08) |
| Sandbox | None. Part 81 is not live | — | Deferred (REQ-INTG-F09) |
| Dependency allow-list | Packages must be listed with an ADR (CP-ARCH-01) | `docs/erp-program/DEPENDENCY_ALLOWLIST.json` | Each new library in §2.8 needs an ADR before it is added |

Open conflicts that touch this part: **CF-012** (cloud provider and region) decides where a file drop (S3), an SFTP host, an MQTT broker and any managed vault run. **CF-013** (identity provider) decides how partner and device identities are issued. **CF-027** (providers still to be chosen) covers Redis and object storage. Part 11 relies on all three.

## 2. Decisions and conflicts that need the owner

These cannot be made safely by assumption, because each changes infrastructure, a vendor, a licence or a control.

1. **Resilience library sequencing.** Connector circuit breakers and timeouts belong to Part 09 S4. Part 09 S4 is not built. Options: (a) Part 11 S1 builds only the connector breaker in `src/intg/`, and Part 09 S4 later absorbs it into `src/core/resilience.ts` (**recommended**: one breaker implementation, moved, not duplicated); (b) Part 11 waits for Part 09 S4.
2. **Credential vault.** Options: (a) encrypted references in `intg_credentials_ref`, with keys held in the environment as the MFA key is today (A-58); (b) a managed key service once CF-012 is decided. **Recommended: (a) now, with a documented move to (b).** Naming who holds the key-rotation duty is an owner item.
3. **Devices and hardware.** Part 11 §5 names biometric terminals, weighbridges, batching-plant controllers, telematics, RFID or barcode gates and flow meters. For each, the owner says: the vendor and model, whether a unit is available for testing at a site, and whether a vendor SDK or a protocol document exists. Without a unit, the adapter is built with recorded sample payloads and marked `unavailable` (REQ-INTG-F17). **No device is simulated as live.**
4. **Approvers for client registration.** CP-INTG-01 needs a named data owner per module and a named IT Security approver. CP-INTG-02 needs the credential maker-checker holders. The owner names the roles and the people, or confirms the role codes from Part 07.
5. **Developer portal audience.** Plan: the portal is authenticated for registered partners only in v1 (A-66). Public reference documentation is a separate decision, because it exposes the API surface. Owner to confirm.
6. **Banks and file formats (Part 65).** Which banks, and which formats each one accepts (NEFT/RTGS file, MT940, CAMT.053, API). Only named banks get adapters.
7. **Scheduling tools.** Confirm the versions of Primavera P6 (XER and XML) and MS Project XML the company uses. Part 38 must exist before S5 can run end to end; until then contract tests only.
8. **New libraries, each with an ADR (CP-ARCH-01).** Proposed: an OpenAPI generator or a generator from the route registry (ADR, §3 A-57); an SFTP client (`ssh2`, MIT); PGP (only if a bank requires it); an MQTT broker (only with a hosting decision, CF-012); CSV and MT940 or CAMT parsers (in-house first, library only if needed). The owner accepts or rejects each.
9. **Maps provider (Part 37).** Only the abstraction is in Part 11. The provider is chosen in Part 37 by residency and offline needs (A-65).

## 3. Assumptions proposed for Part 11

Proposals, recorded in `ASSUMPTIONS.md` only when the owner approves Part 11.

- **A-57 Gateway.** The gateway is in-application, as ADR-005 decides: route handlers, a shared middleware for authentication, scopes, quotas, IP allow-lists and request-size limits, behind the ingress proxy. No dedicated gateway product. OpenAPI 3.1 is generated from the route registry and the typed request and response declarations; the generator needs an ADR (§2.8).
- **A-58 Vault.** Connector secrets are stored as AES-256-GCM ciphertext in `intg_credentials_ref`, using a key from the environment (as `MFA_ENCRYPTION_KEY` does). A secret is shown once at entry and never again. Changes are maker-checker (CP-INTG-02). Rotation reminders at 30 days before expiry. Moves to a managed key service after CF-012.
- **A-59 SSRF control.** Outbound calls go only to hosts listed on the connector's allow-list, approved by IT Security. The resolved address is checked against private, loopback and link-local ranges before the call. Redirects are not followed unless the connector allows them.
- **A-60 Client authentication.** System clients use OAuth2 client credentials, issued as Part 07 service tokens with a fixed permission list. Partner apps acting for a user use PKCE. API keys are allowed only for low-risk reads, and they are hashed at rest.
- **A-61 Quotas.** Each client has a token-bucket quota: 600 requests per minute by default, set per client and approved with the client. Exceeding it returns 429 with `Retry-After`.
- **A-62 Device protocols.** Devices push over HTTPS with a per-device certificate or a per-device HMAC key bound to the site (CP-INTG-04). Vendor pulls and CSV drops are adapters. MQTT is built only after the broker hosting decision.
- **A-63 Retention.** Raw device payloads are kept 30 days. Normalised readings follow the Part 84 retention for each module. Raw retention is short because it may contain location and biometric-adjacent data.
- **A-64 Canonical events.** Vendor payloads map to the canonical events in REQ-INTG-F17. Device readings are evidence and never create an approved transaction on their own (Part 11 §6): a weighment creates a weighbridge ticket, not a GRN.
- **A-65 Maps.** Part 11 owns the provider abstraction and the manual-coordinates fallback. No provider is selected here.
- **A-66 Portal audience.** The developer portal is for registered partners only in v1. Public documentation waits for an owner decision (§2.5).
- **A-67 Connector status.** A connector shows `active` only after a successful real call in that environment. Otherwise it shows `configured_untested`, `unavailable` or `failed`. Contract tests use recorded samples and are labelled as such.
- **A-68 Bulk.** Bulk imports and exports reuse the Part 24 pipeline (upload, validate, preview, error report, import, approval, audit). Part 24 is not built, so the bulk endpoints wait for it (S3).

## 4. Execution phases, deliverables and gates

Each phase is one session (Part 00 §12, Annex E1). A phase starts only when the previous phase's gates are green and the owner has approved the phase where Part 00 requires it.

**Phase 0 — Discovery and plan (this session).** Deliverables: this document; PROGRESS_REGISTER status for `intg`. Gate: none (no code). Stop and report.

**Phase 1 — S1 Connector framework, vault, mappings, monitor.** Deliverables:
- Tables `intg_connectors`, `intg_credentials_ref`, `intg_mappings` (versioned), `intg_messages` (partitioned later), `intg_dlq` (additive migrations with down scripts and DB_EXTENSIONS rows).
- Connector interface: config schema, health check, idempotent call wrapper, retries with the A-50 backoff, a connector circuit breaker (§2.1), per-connector metrics (Part 09 S1 counters), correlation id on every call.
- SSRF-safe outbound client with the A-59 allow-list and address check (REQ-INTG-F01).
- Vault: encrypted references, one-time display, maker-checker for changes (REQ-INTG-F02, CP-INTG-02).
- Mapping service: code mappings with versions and validation (REQ-INTG-F03).
- Monitor data: last success, failure count, latency, status per A-67 (REQ-INTG-F16).
- Tests: SSRF refusal for a private address; a breaker that opens after repeated failures and closes after a probe; a credential shown once; a mapping version that cannot be overwritten.

Gates: `npm run check:all` 9 of 9; the tests above; no connector reports `active` in the test run.

**Phase 2 — S2 API standards, gateway, clients, audit.** Deliverables: the shared gateway middleware (auth, scopes mapped to permission keys, company and project restrictions, IP allow-list, quota, request-size limit, error envelope); API linting rules for naming, paths, pagination, filters and sorting; OpenAPI 3.1 generated from the route registry and diffed in CI (CP-INTG-03); client registration with approval records (CP-INTG-01), scopes, expiry and rotation; `api_clients` and `api_audit` (partitioned, with a hash-chain link for privileged client actions, Part 08); `api.client.anomaly_detected` through the outbox.

Gates: check:all; an external client without an approved scope gets 403; a quota breach gets 429 with `Retry-After`; every call is in the audit (acceptance §16).

**Phase 3 — S3 Developer portal, sandbox, bulk APIs.** Deliverables: partner portal (authenticated, A-66) with catalogue, schemas, events from the Part 10 registry (when Part 10 S2 exists), changelog, deprecation notices with a sunset of at least six months, SDK snippets in TypeScript, Python and C#, a Postman collection, a webhook tester and self-service keys within approved scopes. Sandbox tenant with synthetic data, resettable (REQ-INTG-F09) only after Part 81 is live; until then a documented design. Bulk endpoints wait for Part 24 (A-68).

Gates: check:all; no GA endpoint has a breaking change (CP-INTG-03); a portal user cannot see a scope they were not approved for.

**Phase 4 — S4 Device ingestion service.** Deliverables: device registry (type, site, serial, firmware, owner, certificate fingerprint, status, last seen) with enrolment bound to a site (CP-INTG-04); HTTPS push with per-device credentials (A-62); CSV drop adapter; buffering for intermittent connectivity with ordered, de-duplicated replay; clock-skew correction; `dev_devices` and `dev_readings_raw` (time-partitioned, 30-day retention, A-63); normalised events `device.punch.received`, `device.weighment.recorded`, `device.batch.recorded`, `device.telemetry.received`, `device.gate.scan`, `device.sensor.reading` through the outbox; canonical operational events (A-64); contract tests with recorded sample payloads for each device type; `unavailable` status for any device without a physical unit (§2.3).

Gates: check:all; a device enrolled at site A cannot post readings for site B; a reading never creates an approved record (acceptance: a weighment creates a ticket, not a GRN); the offline replay test delivers each punch once, in order, with its original time and device id.

**Phase 5 — S5 File, scheduling, coexistence and BI adapters.** Deliverables: SFTP and object-storage file drops with checksum and duplicate rejection (`intg_file_drops`), PGP only if a bank requires it (§2.8); bank file adapters per named bank (Part 65 builds the batches); statement import (CSV, MT940, CAMT, API); P6 XER and XML and MS Project XML import and export through Part 38's validation (contract tests until Part 38 exists); accounting coexistence export and import with reconciliation reports (Part 26 phase-out); BI read-only views with row-level scope (Part 75), no direct OLTP access (REQ-INTG-F14).

Gates: check:all; a duplicate bank statement file is rejected by checksum (acceptance §16); a recorded P6 XER sample of 5,000 activities validates in the contract test.

**Final gate for Part 11 (before the owner approves the part).** Independent human review (Part 00 §5.8); acceptance scenarios in Part 11 §16 each with evidence; every open finding either fixed or accepted by the owner.

## 5. Reporting format (required for every phase)

Each session closes with this report, in this order. Missing items mean the phase is not complete.

1. **Phase and slice:** for example `Part 11 · S1`.
2. **Outcome:** one line, stated plainly: built, partly built, blocked, or planned only.
3. **Deliverables:** a list, each with the file or route path and the requirement id (REQ-INTG-Fxx or CP-INTG-xx).
4. **Assumptions and decisions:** the new assumption ids (A-57 onward) and decision ids (D-xxx). Nothing is recorded as approved unless the owner approved it.
5. **Evidence:** the exact command and its result for each gate: `npm run check:all` (x of 9 passed), the named tests, and any contract-test results with the sample files used. Failures are quoted, not summarised away.
6. **Connector status:** each connector or device with its status under A-67, and the environment it was tested in.
7. **Not built and why:** each item from the phase plan that is not done, with the reason.
8. **Owner items:** each question that needs the owner, with the minimum information needed to answer it.
9. **Next step:** the next phase, and whether it needs approval first.

Documentation updated in the same session: `ASSUMPTIONS.md`, `DECISIONS.md` (only for owner-approved items), `CHANGELOG.md`, `DB_EXTENSIONS.md` (for each migration), `modules/intg/traceability.csv`, `PROGRESS_REGISTER.csv` (via `npm run adopt:program`).

## 6. Enhanced execution prompt for Part 11

Use this with Annex E1 at the start of each Part 11 session. The universal requirements U1–U20 (Part 00 §12.2) apply without being restated.

> You are a senior full-stack developer and enterprise architect working on the ERP in `/home/user/ERP_Construction`, branch `claude/bold-allen-rj3t08`.
>
> 1. Read `modules/intg/discovery.md`, Part 11, ADR-005 and the Part 00 sections it cites. Inspect `src/iam/routes.ts`, `src/iam/crypto.ts`, `src/core/rate-limit.ts`, `src/core/jobs.ts` and `src/evbus/` before you change anything.
> 2. Work on one slice only. Phase 0 produces a discovery summary and plan and no code.
> 3. No integration is simulated. A connector reports `active` only after a successful real call in the environment where it runs. Where a device or credential is missing, build the adapter, the recorded-sample contract tests and the manual fallback, and report it as `unavailable`.
> 4. Do not add a package without an ADR (CP-ARCH-01). If a slice needs one, stop and ask for the ADR.
> 5. External systems never write ERP tables directly. Inbound data becomes a proposal or a transaction through the same services, validation and permissions as a user action.
> 6. Record every assumption with an id from A-57 onward. Record an owner decision only when the owner has given it in their own words.
> 7. Preserve working behaviour. Additive, backward-compatible changes only. Any migration ships with a down script, a DB_EXTENSIONS row and an entry in the migration list test.
> 8. Stop and report when a change is destructive, replaces existing code, or conflicts with a documented decision.
> 9. Run `npm run check:all` with the database running and `.env.test` loaded. Do not commit on a failing run.
> 10. Close the session with the reporting format in §5 of this document.
