# PART 00 — PROGRAM CONSTITUTION & AGENT OPERATING SYSTEM

| Field | Value |
|---|---|
| Program | Integrated Construction / EPC ERP — one database, one identity and permission model, one workflow, protocol, audit, notification, document, calculation, posting, reporting and AI-governance layer |
| Part | **00 of 00–86** · Phase 1 — Governance, Discovery & Architecture |
| Module code | `pgm` |
| Nature | Governing document. **Load this file in every agent session**, together with the Part being executed. It replaces the old `00_READ_FIRST` set (MI, SA, PC, SEC, AUD, NEVER/ALWAYS, prompt architecture, size control). |
| Annexes (load only when a Part cites them) | A — Design System (`P00_ANNEX_A_DESIGN_SYSTEM.md`) · B — Construction Domain Reference (`P00_ANNEX_B_CONSTRUCTION_DOMAIN_REFERENCE.md`) · C — Master Index & Dependencies (`P00_ANNEX_C_MASTER_INDEX.md`) · D — Legacy Mapping & Run Plan (`P00_ANNEX_D_LEGACY_MAPPING_AND_RUN_PLAN.md`) · E — Session Prompts (`P00_ANNEX_E_SESSION_PROMPTS.md`) · `design/` (tokens, icon registry, dashboard reference) |

> **Role for the executor.** You are a senior enterprise delivery team in one: solution architect, full-stack engineer, database engineer, security engineer, QA lead and DevOps engineer, advised by a Senior Construction Project Director, CFO, Procurement In-charge, Store In-charge, Quantity Surveyor, Planning Manager, Commercial Manager and HR In-charge. You build **one real, integrated, production-ready Construction ERP** — not a prototype, not a set of disconnected CRUD screens, not a dashboard mock-up. You work on an **existing, live system**: inspect before you change, reuse before you create, extend before you replace, and replace only through the governed change path in §7.

---

## §1 HOW TO USE THIS PACK

### 1.1 Session context budget — hard ceiling 95,000 tokens, working target 70,000
The pack is written for **Claude Haiku 5.5** (§13). Every agent session stays inside a **hard ceiling of 95,000 tokens** of context, and plans for a **working target of 70,000** so that tool output and code reading never push it over:

| Item | Budget |
|---|---|
| This constitution (Part 00) | ≤ 24,000 tokens |
| The Part being executed | ≤ 16,000 tokens |
| Annex sections the Part cites (load only the cited sections) | ≤ 14,000 tokens |
| Static load (the three rows above) | ≤ 54,000 tokens — proven per Part in `VERIFICATION_REPORT.md` |
| Repository context the agent reads (system map, discovery notes, code, tool output) | the remainder up to 70,000; never beyond 95,000 |

`VERIFICATION_REPORT.md` proves the static budget (Part 00 + the Part + every annex it cites, worst case) for every Part. If a session's working context approaches 70,000 tokens, the agent writes what it has learned to `docs/erp-program/modules/<code>/session-notes.md`, ends the session with a completion or hand-over report (Annex E2/E8), and the next session continues from the notes — it never silently drops requirements.

### 1.2 Run order
1. Read this file once in full; skim Annex C (index) and Annex D (legacy mapping and run plan).
2. Execute Parts strictly in sequence order **00 → 86**, where a lettered Part (08A, 25A, 25B, 25C, 50A, 50B, 52A, 80A) runs directly after the numbered or lettered Part it follows. A Part starts only when every Part in its *Depends on* list is **APPROVED** (§5.9). Parts with no dependency between them may run in parallel only when Annex C lists them in the same parallel lane.
3. One Part per agent session, using the kick-off prompt in Annex E. Large Parts may be split into **slices** (each slice = one session) exactly as the Part's *Delivery slices* section defines.
4. Close each Part with the completion report (Annex E §2) and the audit record (§5.8). Close each phase with the phase gate (Annex E §4).

### 1.3 Identifiers (stable across any future renumbering)
| Identifier | Format | Example |
|---|---|---|
| Part | `Part NN` or `Part NNA` for a Part inserted after Part NN (sequence position) | Part 46, Part 50A |
| Module code | lower-case, unique (Annex C) | `proc` |
| Feature flag | `ff.<code>[.<feature>]` | `ff.proc.rfq` |
| Requirement | `REQ-<CODE>-F<nn>` | `REQ-PROC-F07` |
| Control point | `CP-<CODE>-<nn>` | `CP-PROC-03` |
| Detection rule | `DR-<nn>` (catalogue §9.9) | `DR-13` |
| Permission | `<code>.<feature>.<action>` | `proc.po.approve` |
| Event | `<code>.<entity>.<past_tense_verb>` | `proc.po.approved` |
| API | `/api/v<major>/<code>/<resource>` | `/api/v1/proc/purchase-orders` |
| Table (new) | `<code>_<plural_noun>` unless the existing convention differs | `proc_purchase_orders` |
| Evidence root | `docs/erp-program/modules/<code>/` | `docs/erp-program/modules/proc/` |

Legacy identifiers (old prompt numbers, `part-NNN`, `p0NN`, `REQ-P0NN-Fnn`, old module codes) remain valid through the alias table in Annex D. **Never rename a built permission key, event, route or table to match this pack** — map it.

---

## §2 MISSION, SCOPE AND PRECEDENCE

### 2.1 Mission
Deliver a single construction business operating system in which tendering, estimation, contracts, planning, site execution, procurement, stores, plant, RMC and production units, workforce, quantity surveying, billing, finance, quality, HSE, documents, communication, analytics and administration run on **shared, consistent, governed enterprise data**, so that every rupee, cubic metre, man-day and machine-hour is **planned, authorised, executed, recorded, reconciled and closed** with named accountability.

### 2.2 The master business thread (no stage re-keys data captured earlier)
Organisation → Company → Branch → Project → Contract → WBS → CBS → BOQ / MTO → Item → Resource → Rate Analysis → Estimate → Budget → Schedule → Work Authorisation → Procurement → Commitment → Stores → Execution (DPR) → Quality → Measurement → Billing → Accounts → Actual Cost → Forecast (EAC) → Variance → P&L → Cash → Profitability → Closeout → Knowledge.

### 2.3 In scope / out of scope
- **In scope:** everything in Parts 01–86 (including lettered Parts 08A, 25A, 25B, 25C, 50A, 50B, 52A, 80A), India-ready and configurable for other jurisdictions (statutory items are effective-dated configuration, never code).
- **Out of scope (owner decision):** BIM model authoring/viewing/IFC parsing/model-based take-off and Process Mining. Kept in `EXCLUDED/` as a ready brief. Drawing control, RFIs, engineering deliverables, GIS and file/API exchange with design tools remain in scope. A scope change needs a new approved Part — excluded scope is never built opportunistically.

### 2.4 Precedence
**§4 Non-negotiable rules → this constitution (§2–§12) → the Annexes → the individual Part.** A Part may *tighten* a rule, never relax it. On conflict: log it in `docs/erp-program/CONFLICTS.md` (what, where, options, recommendation), stop the affected slice, continue unaffected slices, and ask for a decision. Never guess on money, quantity, permission, data deletion or schema change.

---

## §3 EXECUTION MODES

Each Part declares its default mode; discovery may change it (record why in `DECISIONS.md`).

| Mode | When | What the agent does |
|---|---|---|
| **BUILD** | Capability absent in the existing system | Implement fully per the Part, additive. |
| **EXTEND** | Capability partly exists | Map existing → required (REUSE / EXTEND / NEW per element), implement the gap, keep old behaviour byte-compatible. |
| **VERIFY & EXTEND** | Capability was built under the old pack (Annex D marks it *legacy-built*) | (1) Locate the legacy implementation and its gate report/audit record; (2) run this Part's acceptance tests against it; (3) produce a gap list; (4) implement only the gaps; (5) re-run the gate. Do **not** rebuild working functionality. |
| **REPLACE (governed)** | Discovery proves an existing component cannot meet the requirement (§7.3 criteria) | Follow the Architecture & Database Change Path (§7.4): ADR → approval → expand → migrate → parallel run → cut-over → contract, with rollback at every step. |

---

## §4 NON-NEGOTIABLE RULES (they win every conflict)

### 4.1 Data and functionality preservation
- N1 Never delete, overwrite, truncate or "clean up" business or historical data. Corrections are reversals, amendments or new versions.
- N2 Never drop, rename, retype, or change PK/FK/unique/check constraints, indexes, triggers, views or procedures on existing objects **outside** the governed change path (§7.4). Inside it, the contract step happens only after a verified parallel run and written approval.
- N3 Never break a released API (path, status codes, payload shape), event, route, report output, calculation or workflow. Add `/v2`, a new event version or a new route; keep the old one working and monitored.
- N4 If an existing calculation is wrong, add the corrected formula version alongside, run it in shadow mode, publish the difference report, and switch only after approval. Never silently change a number users rely on.
- N5 Never duplicate master records (party, item, employee, plant, project, site, UOM, tax code, cost code) or build a module-local copy of shared data.
- N6 Never edit posted financial entries, approved documents, certified measurements, frozen baselines or closed-period snapshots in place.

### 4.2 Real functionality
- N7 No simulated integrations: a connector is `active` only after a successful real call; missing devices or credentials mean an adapter + contract tests + manual fallback marked `unavailable`. No mock APIs, fake buttons, placeholder forms, hard-coded KPIs, sample data, "coming soon" tiles or frontend-only calculations in production paths. Seed/demo data lives only in separated seed scripts and the sandbox (Part 81).
- N8 A screen is done only when its API, business logic, database, permissions, validation, workflow, controls, audit, notifications and error handling are connected.
- N9 Every business number is computed by the Central Calculation Engine (Part 22) on the server; the client may preview but never persists its own value.

### 4.3 Security and authority
- N10 Authorisation is server-side on every path — UI, API, service, job, socket, import, export, search, report, notification, chat preview, offline sync and AI tool. UI checks are convenience only.
- N11 Never trust client-supplied roles, IDs of company/project/account, hidden fields, URL parameters, local storage or unverified token claims. Scope comes from the server session.
- N12 No hard-coded credentials, debug bypasses, hidden admin accounts, backdoors, disabled TLS verification, wildcard CORS with credentials, SQL string concatenation, unvalidated uploads or secrets in code, logs or client bundles.
- N13 The same person never makes and checks the same controlled record, approves at two levels of one instance, or approves their own exception. Delegation stays subject to SoD.
- N14 AI, MRP, copilots, scenarios and automation create **proposals or drafts only**. They never approve, post, pay, order, change budgets/rates/contracts/permissions, hire/terminate, or delete.
- N15 Chat messages are never approvals, financial authorisations or contractual instructions unless converted through a workflow. Approval cards in WorkChat act only through the workflow engine with the acting user's identity and step-up (Part 25B). No feature, role or support tool reads private message content outside the four-eyes compliance export, and none decrypts end-to-end encrypted content (Part 25C).
- N16 Government APIs (GST e-invoice, e-way bill, TDS, EPFO, etc.) are called only from the backend compliance service, with idempotency and status-check before retry; never print a self-generated IRN/QR as a government one.

### 4.4 Protocol and control
- N17 No plan → no execution. No verification → no approval. No approval → no commitment. No record → no payment. No reconciliation → no closure.
- N18 No controllable action (purchase, issue, transfer, consumption, labour booking, plant use, payment, cancellation, reversal, modification, back-dated entry) bypasses `protocol.check()` and the action ledger — including imports, jobs, APIs, offline sync, admin screens and AI drafts.
- N19 Deviations beyond approved quantity, budget, schedule, specification, rate or process only through an approved, single-purpose, expiring exception with reason code.
- N20 Controls on legacy flows start in OBSERVE; moving to WARN/ENFORCE needs a shadow-period impact review and recorded Management approval.
- N21 Every control, alert, exception, task, RFI, reconciliation and approval has a named responsible department and person; routing failures surface, never disappear.
- N22 A project month never closes without the mandatory material reconciliation and resolved or approved exceptions.

### 4.5 People decisions and fairness
- N23 Performance, productivity and compliance scores are management information only; they never trigger employment, pay or disciplinary decisions without a named human reviewer who records the decision and reason. External dependencies are excluded from employee-controlled delay.

### 4.6 Experience and governance
- N24 No module-local theme, colour, font, icon set, page frame or menu; every screen uses the Part 12 design system and shell.
- N25 No desktop-only feature where field, tablet or mobile use is required.
- N26 Build, test, audit and development status never appear in business navigation, dashboards, search, notifications or reports — only in the repository, CI and the restricted Technical Console.
- N27 A Part never starts before its dependencies are APPROVED, and is never marked complete without its traceability matrix, gate report and signed audit record.
- N28 Third-party source (including any Signal components) is used only from a pinned commit with licence record, SBOM entry and legal approval; the company's apps carry the company's own name.

### 4.7 Always
- A1 Inspect → Reuse → Extend → Preserve → Integrate → Audit → Test, in that order, every time.
- A2 Write the discovery note and impact sheet (§5.2–5.3) before the first migration.
- A3 Put new capability behind a feature flag, default OFF in production until accepted, with a kill switch.
- A4 Carry correlation IDs from UI to API, service, database trace, event, worker and audit; show them on every error.
- A5 Store the item version, rate-analysis version, resource-rate versions, tax-rule version and formula version used on every transaction that depends on them.
- A6 Show planned vs actual (time, quantity, cost, productivity, consumption, wastage, progress) wherever work is executed; escalate breaches with value at risk and an owner.
- A7 Capture evidence at the source (document, photo, GPS/time, reason) for important transactions.
- A8 Let management drill from every KPI to the source transaction, evidence, approval and audit trail.
- A9 Record every decision, conflict, migration, event, permission, control point, KPI and report in the program documentation set (§11).
- A10 Stop and report rather than guess when a requirement would break any rule above.

---

## §5 THE PART LIFECYCLE

```
DEFINITION OF READY → DISCOVER → IMPACT → PLAN → IMPLEMENT → VERIFY → TEST → AUDIT → REGRESSION CHECK → APPROVE → HANDOFF
```

### 5.1 Definition of Ready (check before anything else)
- Every dependency Part is APPROVED (signed audit record exists). If not: STOP and report.
- Main branch is green (`erp:regression`), golden outputs unchanged, open `CONFLICTS.md` items touching this Part reviewed.
- Feature flag registered; environments available (dev, test, staging; preview/sandbox where relevant).

### 5.2 Discover (`docs/erp-program/modules/<code>/discovery.md`)
Search code (routes, controllers, services, components, jobs, sockets, report templates, migrations, seeders) and the database catalogue (tables, columns, views, functions, triggers, indexes, row counts) for the Part's keywords and legacy aliases. Produce:

| Requirement / entity / screen / API / job / calculation | Existing artefact | Decision REUSE / EXTEND / NEW / REPLACE | Reason | Risk |
|---|---|---|---|---|

Two existing implementations of one concept, contradictory calculations or duplicate masters → `CONFLICTS.md` with a proposed consolidation; keep both working through an adapter until the consolidation is approved.

### 5.3 Impact sheet (`impact.md`) — answer all fifteen questions
1 Master data used · 2 Transactions created · 3 Records affected · 4 Dependent modules · 5 Permissions · 6 Workflow · 7 Calculations · 8 Reports · 9 Audit records · 10 Financial impact (postings) · 11 Project/WBS/BOQ/cost relationships · 12 Mobile/tablet/desktop behaviour · 13 Existing functionality at risk · 14 Test approach · 15 Regression verification. Then choose **the smallest compatible change that completely satisfies the requirement**.

### 5.4 Plan
Slice plan (from the Part's *Delivery slices*), migration list, API list, event list, permission list, control-point list, screen list, test list, rollback plan, adapters used for engines not yet live (each with the Part that removes it).

### 5.5 Implement (standard order inside a slice)
1 Feature flag → 2 additive migrations (§7) → 3 permission keys and SoD rules (Part 07) → 4 control points seeded in OBSERVE (Part 17) → 5 domain services with the shared hooks `authorize · validate · calculate · protocol.check · persist · audit · ledger · emit · notify · attach · nextNumber` in **one transaction per business action** → 6 workflow definitions (Part 16) → 7 APIs + OpenAPI → 8 events in the catalogue → 9 notifications/templates → 10 screens on page templates for all devices → 11 reports, prints, widgets, search objects, navigation entries → 12 imports/exports via Part 24 → 13 tests → 14 documentation.

### 5.6 Verify and test
Self-check every `REQ-<CODE>-Fnn` end to end; run the Part's test scenarios plus the universal gate (§10.2). Evidence under `modules/<code>/evidence/`.

### 5.7 Regression check
Full existing suite, golden outputs (Part 01), DB integrity (pre-existing tables: schema diff EMPTY unless a §7.4 change was approved; row counts and checksums reconciled), every earlier Part's regression suite, visual baselines.

### 5.8 Audit (`modules/<code>/audit.md`) — dimensions AUD-1…AUD-18
AUD-1 functional · AUD-2 UI/UX consistency · AUD-3 theme/dashboard · AUD-4 navigation · AUD-5 database · AUD-6 API/events · AUD-7 permissions/SoD · AUD-8 workflow & controls · AUD-9 validations · AUD-10 reports · AUD-11 notifications · AUD-12 integrations & adapters · AUD-13 responsive/offline · AUD-14 security · AUD-15 performance · AUD-16 error handling · AUD-17 regression · AUD-18 build/deploy/rollback. Each PASS / FAIL / N/A (reason) with evidence link. **High-risk Parts** (Annex C) need an independent reviewer who did not write the code. Severity: *Critical* (data loss, destructive migration, broken behaviour, security exposure, wrong money) → stop and fix; *High* (requirement unmet, permission gap, workflow/control bypass, visible design violation) → fix before approval; *Medium/Low* → may be accepted with owner and target Part.

### 5.9 Approve and hand off
Product owner + technical lead sign the audit record. Handoff note lists published APIs, events, widgets, permissions, control points, reports, adapters still in place (and which Part removes them) and anything formally deferred. An approval is invalidated automatically when later changes touch the Part's code without re-running its gate.

---

## §6 ARCHITECTURE CONTRACTS (AC)

### AC-1 One system
One logical database (per tenant/company group), one identity and permission engine, one workflow engine, one protocol engine, one audit log, one event bus, one notification engine, one document service, one numbering service, one calculation engine, one posting engine, one reporting/semantic layer, one AI gateway, one design system. **No module builds a private copy of a shared engine.** Platform engines are sequenced before the business modules that consume them; where a Part needs an engine sequenced later, it uses a thin adapter over existing behaviour, records it in `DECISIONS.md`, and the engine's Part removes it.

### AC-2 Layering and module boundaries
```
Experience     : Web (desktop/tablet) · Field app (PWA/native) · Portals · Print/PDF · Email/WhatsApp
Workspaces     : Launchpad · My Inbox · Role & department workspaces · Project 360 · Control towers
Domain modules : one bounded context per module code; owns its tables; exposes services, read views, events
Shared services: Identity/permission · Workflow · Protocol · Audit · Ledger · Numbering · Documents · Notification ·
                 Calculation · Posting · Search · Reporting · Integration hub · Scheduler/queue · Feature flags · AI gateway
Data           : Operational DB (existing, preserved + extended) · outbox/inbox · object storage · cache · search index ·
                 read replica · analytics warehouse
```
- A module writes only its own tables. Other modules read through its service API or published read views and react to its events — **never** write another module's tables.
- Masters are owned by Part 21 (and the owning master Parts: org 06, item 23, HR 54, plant 50); modules reference by ID (+ version where versioned).
- Money reaches the ledger only through the posting engine (Part 26). Approvals only through the workflow engine (Part 16). Files only through the document service (Part 19). User messages only through the notification engine (Part 10). Controllable actions only through the protocol engine (Part 17).

### AC-3 Technology baseline
The existing stack recorded by Part 01 is the implementation stack. Do not introduce a second framework, ORM, state manager, real-time server, queue or UI library without an approved ADR (Part 02). Reference choices where a layer is absent: TypeScript; React (web) with the Part 12 design system; React Native or PWA (field); Node.js services (modular monolith first, extractable modules); PostgreSQL 15+ (row-level security for tenant/project scoping where adopted, partitioning for high-volume tables, read replica); Redis (cache, rate limits, socket adapter); a durable queue (BullMQ/RabbitMQ/Kafka as Part 02 decides); S3-compatible object storage; OpenSearch/PostgreSQL FTS for search; OpenTelemetry; containerised deployment with IaC. Technology is replaced only for a recorded compatibility, scalability, security or performance reason.

### AC-4 APIs
Versioned `/api/v<major>/<code>/…`; reuse the existing API style if it differs. Server-side pagination (cursor or page, max 200), sorting, filtering, field selection. Server validation is authoritative. Optimistic locking with `version`. **`Idempotency-Key` mandatory** on financial, stock, approval, posting, payment and offline-sync writes (duplicate key → original result). Error envelope `{code, message, reason, action, fieldErrors[], correlationId}`. OpenAPI generated and diffed in CI; breaking change on a released version fails the build; deprecation ≥ 6 months with usage monitoring. Rate limits per user, role and integration key. DTOs only — never internal table shapes.

### AC-5 Events and real time
Name `<code>.<entity>.<past_tense_verb>`; envelope `{eventId, type, schemaVersion, occurredAt, companyId, projectId, siteId, entityType, entityId, actorId, correlationId, causationId, data}` with minimal, non-sensitive payload (consumers fetch details through permission-checked APIs). **Transactional outbox** written in the same DB transaction as the business change; relay → bus/queue → consumers with an **inbox** for exactly-once business effect; DLQ, replay and schema registry (Part 10). Socket rooms `user:`, `project:`, `site:`, `dept:`, `conv:`; server re-checks permission before every emit; clients re-sync with `since=<lastEventId>` on reconnect. Every event is registered in `EVENT_CATALOGUE.md` (producer, consumers, schema, PII flag).

### AC-6 Numbering
Central numbering service: series per company / project / document type / financial year, template e.g. `PO/{PROJECT}/{FY}/{SEQ:5}`; gap-free where statute requires (tax invoices, credit/debit notes); number assigned at submit or approve as configured; drafts carry temporary IDs; existing numbering preserved and wrapped.

### AC-7 Money, quantity, tax, calendar
- Types: amounts `DECIMAL(18,2)`, rates `DECIMAL(18,4)`, quantities `DECIMAL(18,3)` (configurable per UOM), percentages `DECIMAL(9,4)`, exchange rates `DECIMAL(18,8)`; never floating point. Intermediate precision ≥ 8 decimals; rounding only at policy points (line, document, tax) per the rounding policy (Part 22).
- Base currency per company (default INR); multi-currency with effective-dated exchange rates where contracts require.
- UOM master with conversions; every quantity carries its UOM; conversions only through the master.
- Timestamps in UTC; display in the user's zone (default Asia/Kolkata); business dates (bill date, DPR date) stored as dates.
- Financial year configurable (default April–March); period locking per company and module.
- Tax, statutory rates, thresholds and windows are **effective-dated configuration** confirmed by the tax/HR team (Part 27, Part 56) — never hard-coded law.
- Indian digit grouping and lakh/crore abbreviations are a display preference; storage is plain decimals.

### AC-8 Financial posting
Modules never write GL tables. They emit a posting request keyed `source_type + source_id + event` to the posting engine (Part 26). Posting rules are configuration (account determination by company, project, category, tax code, document type). Posting is idempotent; reversal creates a reversing entry referencing the original; posting into a locked period is rejected with an actionable message. Every GL line carries company, project, site, cost centre, profit centre, WBS/cost code where applicable and the source reference for drill-back. Sub-ledgers reconcile to GL at every close.

### AC-9 Documents and files
All files through the document service (Part 19): content-type sniffing, size/type allow-list, malware scan, SHA-256 checksum (duplicate detection), metadata, versioning, ACL inherited from the parent record plus document-level ACL, private storage, short-lived signed URLs, audited download. Business records store `document_id`, never paths. Field photos carry capture time, GPS (where permitted) and device ID; originals retained where configured.

### AC-10 Notifications
`notify(recipients | audience rule, templateCode, context, priority, channels)` through Part 10, delivered through the communication gateway (Part 25) for external channels. Levels: Information, Action required, Warning, Critical, Escalation. Versioned templates, user preferences, mandatory categories (approvals, security, statutory deadlines) cannot be muted, deduplication window, digest, quiet hours (except critical), delivery log. Notifications contain only what the recipient may see.

### AC-11 Workflow
Standard states `DRAFT → SUBMITTED → IN_REVIEW → (RETURNED ↺) → APPROVED | REJECTED`, plus `CANCELLED`, `CLOSED`, `REVERSED`; module sub-states map to these. Modules call `workflow.submit / act` and subscribe to `workflow.instance.completed`; routing is versioned configuration (amount, project, department, category, risk, overrun %, vendor type) with authority limits, delegation, SLA, escalation. Approved business fields are locked; change = amendment (new version with its own approval) or documented reversal.

### AC-12 Audit
Append-only, hash-chained `audit_log` (who, impersonated-by, session, IP, device, company/project/site, module, entity, action, before/after, changed fields, reason, workflow task, correlation ID, prev_hash, hash); no UPDATE/DELETE grants for the application role; nightly chain verification; mandatory reason for reject, return, cancel, reverse, unlock, override, back-dated entry, master merge, permission change, restore; print/export/download of controlled documents audited. Retention configurable (default ≥ 10 years for financial records).

### AC-13 Data labels
Every operational reading or quantity also carries its **source** — `manual`, `imported`, `integrated_live`, `integrated_delayed`, `system_calculated` — and its **status** (`draft`, `submitted`, `pending_approval`, `approved`, `rejected`, `returned`, `posted`, `reversed`); only approved (operations) or posted (finance) values feed final totals and pending values are shown separately. Deviations are described factually ("unexplained variance of 18 L"); system text never labels a person as dishonest or a suspect. Every number on dashboards, reports, exports and AI output carries its nature: **ACTUAL** (posted/approved), **CALCULATED** (deterministic formula — formula on hover), **FORECAST** (method and date), **AI INTERPRETATION** (advisory, with sources), **PROVISIONAL** (draft/unapproved/offline).

### AC-14 External portals
Separate route namespace (`/api/portal/v1/…`), token audience `portal`, MFA option, own rate limits; party-scoped authorisation (own records and explicitly shared project scopes only; never internal cost, budget, margin, competitor or other-party data); portal submissions are proposals reviewed internally and pass the same controls; access expires with the contract unless extended; everything audited.

### AC-15 Excel and documents principles
Excel = controlled exchange: master data → approved template → entry → upload → validate → preview → (approve) → transaction → audit; never writes production tables directly (Part 24). Documents = presentation layer: approved data → approved template → render → approve/sign → PDF/print → distribute → verify (QR) → audit; the document layer never recalculates money or quantities (Part 20).

### AC-16 Enterprise data and AI
Analytics read from replicas/warehouse, never from hot OLTP paths for heavy queries (Part 75). Certified KPIs come from the metric catalogue with lineage to source transactions. AI runs through one gateway (Part 79): permission-scoped read tools, prompt/response logging without secrets, PII minimisation, provider abstraction, evaluation, cost quotas, human review before management distribution; AI never writes business data except drafts the user explicitly submits.

---

## §7 DATA, DATABASE AND ARCHITECTURE CHANGE STANDARD

### 7.1 Default: preserve and extend
On existing objects, the default allowed changes are: new tables; 1:1 extension tables `<table>_ext` keyed by the existing PK (preferred over altering hot tables); new nullable columns or NOT NULL with a safe default; new indexes created concurrently; new views, compatibility views and materialised views; back-fills into **new** columns/tables via idempotent, batched, resumable, audited jobs.

### 7.2 Conventions for new tables
Existing naming convention first; else `snake_case`, plural, module prefix. Standard columns: `id` (existing PK style: UUID v7 or bigint), `tenant_id`/`company_id`, `project_id`, `site_id` (nullable where not scoped), `doc_no`, `status`, `workflow_instance_id`, `created_by/at`, `updated_by/at`, `version` (optimistic lock), `is_active`, `deleted_at/by` (soft delete; hard delete prohibited for business records; delete only in DRAFT, audited), `source_type` + `source_id` (lineage), `remarks`. Foreign keys to central masters only. Constraints, check rules and FKs are **mandatory on new tables**. High-volume tables (audit, events, stock ledger, attendance punches, telematics, notifications) are partitioned by time from creation.

### 7.3 When preservation is not enough — replacement criteria
A component, schema or technology may be **replaced** only when discovery (Part 01 fitness assessment) proves at least one of:
1. It cannot meet a mandatory functional requirement without unsafe workarounds (e.g., no project dimension on cost records, no versioning possible on rates).
2. It cannot meet non-functional targets (§10.3) after reasonable tuning (indexing, caching, partitioning, read replica) — evidenced by load tests.
3. It is insecure by design (e.g., plaintext secrets, no tenant isolation) and cannot be hardened additively.
4. It is unsupported/end-of-life with known exploitable vulnerabilities and no upgrade path.
5. Its data model makes integrity guarantees impossible (no transactions, duplicated masters with no reliable keys, floating-point money).
Convenience, preference or "a cleaner design" are **not** criteria.

### 7.4 Architecture & Database Change Path (ACP) — mandatory for any REPLACE
| Step | Action | Exit evidence |
|---|---|---|
| 1 ADR | Architecture Decision Record: problem, criteria met (7.3), options (keep/extend/refactor/replace), chosen option, data mapping, risks, cost, rollback, owners | `docs/erp-program/adr/ADR-nnn.md` approved by technical lead, product owner and (for financial data) CFO delegate |
| 2 Expand | Create new structures beside the old; no change to old objects | Migration applied in staging; schema diff shows only additions |
| 3 Migrate | Back-fill with batched, resumable, idempotent jobs; dual-write or CDC to keep old and new in sync; data-quality rules applied; rejects to a quarantine table, never dropped | Row counts, checksums, financial totals and sample-record comparisons reconcile 100 % (tolerance 0 for money and quantity) |
| 4 Parallel run | Reads served from old and new; outputs compared (golden outputs, reports, balances) for an agreed period (≥ one month-end close for financial data) | Difference report = zero unexplained differences, signed |
| 5 Cut-over | Switch reads/writes to new behind a flag; old kept read-only and synchronised back where feasible | Cut-over runbook executed; smoke tests green; rollback rehearsed within RTO |
| 6 Contract | Remove dependency on the old structure (old objects archived, then retired) only after the stability window and written approval | Archive verified and restorable; approval recorded |

Every step is reversible until step 6; rollback triggers and owners are defined in the ADR. Verified backup + restore test before steps 2, 3 and 5. No step runs during a financial period close.

### 7.5 Migration rules (every migration)
Additive by default, idempotent, timestamp-named, reviewed, reversible (down removes only what the migration created), applied by the pipeline (never by hand in production), registered in `DB_EXTENSIONS.md` (Part, object, type, purpose, reversible, back-fill, owner). Before and after each production batch: verified backup, integrity check (FKs, orphans, balances), row counts/checksums of pre-existing tables. Long-running DDL uses online techniques; locks are budgeted (statement timeout). Seed data is environment-specific and never loaded to production unless it is reference data approved for production.

### 7.6 Data integrity invariants (tested continuously by Part 03 jobs)
Debits = credits per voucher; sub-ledgers = GL control accounts; stock ledger quantity/value = on-hand by item/store/batch; BOQ quantity chain consistent (certified ≤ executed tolerance, billed ≤ certified); commitments − invoiced = open commitment; Σ EAC components = EAC; no orphan references; audit hash chain intact.

---

## §8 SHARED ENGINE CONTRACTS (SE)

- **SE-1 Calculation (Part 22).** Every business formula — money, quantity, UOM, rate, tax, rounding, BOQ amount, rate-analysis component, take-off, budget availability, commitment, EAC/ETC/VAC, EVM indices, RA-bill cumulative/previous/current, retention and recoveries, price variation, inventory valuation, depreciation, payroll components, P&L lines, KPIs — is a registered formula with code, version, owner Part, input/output schema, effective dates and golden tests. Changes run in shadow mode with a difference report before activation. CI blocks new code that computes business values outside the engine.
- **SE-2 Item Master & Item Selector (Part 23).** Every reference to work item, material, labour category, equipment, service, subcontract item, consumable, tool or asset stores item ID **and** item version ID. The Item Selector is the only picker. Free text only as `NON_CATALOGUE` with reason, creating a mapping task. Existing item-like masters stay physical masters, registered, never copied or renumbered.
- **SE-3 Rate analysis (Part 29).** Unit rate = Σ(consumption qty × applicable rate) + add-ons ÷ basis quantity. Transactions store analysis and resource-rate versions. Historical rates are append-only.
- **SE-4 BOQ quantity chain (Parts 33, 42, 60, 61, 65, 67).** Per BOQ line: Original → Revised → Executed → Certified → Billed → Paid → Balance → Forecast; each value owned by exactly one module and never typed in another. Released MTO revisions are the only source of derived material demand and publish deltas.
- **SE-5 Budget → commitment → actual → EAC (Parts 39, 46, 59, 64, 67).** Typed budget versions with lineage and one APPROVED current version per project. Open commitment = committed − invoiced/billed. Actual = posted cost + uncommitted actuals. Accrued = received/measured not invoiced. EAC = Actual + Accrued + Open commitment to be incurred + Uncommitted ETC + Risk allowance; **Σ components = EAC** is a mandatory test. Commitment/actual events consumed idempotently — replay never double counts.
- **SE-6 P&L vs cash (Parts 65, 68).** P&L from posted accounting and approved recognition; cash from receipts/payments and their forecasts; never mixed. Closed-period snapshots immutable; restatements are new versions with reason.
- **SE-7 Offline (Part 14).** Field modules register commands, offline validation schemas and conflict rules; server is authoritative; offline records are PROVISIONAL until accepted; financial/approval conflicts need human resolution; approvals, payments, postings and master changes are online-only.
- **SE-8 Identity, ABAC & SoD (Part 07).** Authorisation = RBAC + ABAC + SoD through one policy hook. Scope chain: Tenant → Company → Branch → Department → Project → Site → Module → Feature → Action → Record → Field. Step-up MFA for payment release, bank-detail change, permission grant, large export and high-band approvals.
- **SE-9 Traceability.** Every requirement traces requirement → migration → service → API → UI → test → evidence (`traceability.csv`); every KPI and report figure has lineage to source transactions (Part 75).

---

## §9 PROTOCOL & CONTROL FRAMEWORK (PC)

### 9.1 Control cycle
**PLAN → VERIFY → APPROVE → EXECUTE → RECORD → MONITOR → RECONCILE → CLOSE.** Each stage is evidenced by the owning module's record (PR = plan, CS = verify, PO approval = approve, GRN = record…); the protocol engine (Part 17) tracks stage status per activity by listening to events — it does not copy business data.

### 9.2 Control point (CP) model
Attributes: `cp_code` (`CP-<CODE>-nn`), `stage`, `trigger` (service action or schedule), `check_type` (PLAN_EXISTS, BUDGET_AVAILABLE, STOCK_AVAILABLE, BALANCE_QTY, DUPLICATE, THRESHOLD, DOCUMENT_REQUIRED, SOD, CERTIFICATION_VALID, PERMIT_VALID, SPEC_APPROVED, DRAWING_CURRENT, TIME_WINDOW, SEQUENCE, GEO_FENCE, RECONCILIATION, CUSTOM), `enforcement` (BLOCK · EXCEPTION · WARN · MONITOR), `evidence`, `threshold_ref`, `escalation_ref`, `owner_role`, `mode` per company/project/module (OFF · OBSERVE · WARN · ENFORCE). Services call `protocol.check(ctx, cpCodes|trigger, payload)` **inside** the business transaction; result `PASS | WARN | EXCEPTION_REQUIRED | BLOCK` with what/why/what-to-do; every evaluation is logged as evidence. Parts list their CPs in a table: *CP · Stage · Rule · Enforcement · Evidence/threshold · Escalation*.

### 9.3 Exceptions
Types include QTY_OVER_PLAN, BUDGET_OVERRUN, SCHEDULE_DEVIATION, SPEC_DEVIATION, PROCESS_DEVIATION, EXCESS_CONSUMPTION, EMERGENCY_PURCHASE, SINGLE_SOURCE, NON_L1_SELECTION, BACK_DATED_ENTRY, CANCELLATION, REVERSAL, MODIFICATION_AFTER_APPROVAL, UNPLANNED_WORK, OVERTIME_EXCESS, IDLE_RESOURCE_RETENTION, DOCUMENT_WAIVER, RATE_ABOVE_BENCHMARK, CREDIT_LIMIT, PAYMENT_PRIORITY_OVERRIDE. Record: requester, CP, reference, requested vs approved value, variance and cost/time impact, reason code + narrative (≥ 20 chars; "Other" ≥ 50), evidence, corrective action, validity (single-use / until date / quantity cap), approver chain from the exception matrix (severity by % and absolute value; seed: ≤ 5 % → PM; 5–10 % → PM + Cost Controller; > 10 % or > ₹5 lakh → Management), status. Approved exceptions are consumed by the transaction they authorise. **Emergency path** (safety, breakdown on critical path, weather): execute with EMERGENCY flag + photo + GPS + reason; regularise within the configured window (default 24 h) or auto-escalate to Management.

### 9.4 Threshold matrix (seed defaults; effective-dated configuration per company / project type / project / material group)
`budget.warn_pct` 90 / `budget.block_pct` 100 · `material.wastage_allowed_pct` per material (cement 2, steel 3, bricks 5, aggregates 5, sand 5, RMC 1.5, tiles 5, paint 5) · `material.issue_over_plan_pct` 0 · `grn.over_receipt_pct` 2 · `price.variance_pct` 5 · `schedule.slip_days_warn/escalate` 3/7 · `labour.productivity_min_pct` 80 · `labour.ot_max_pct` 10 · `labour.idle_hours_pct` 10 · `plant.utilisation_min_pct` 60 · `plant.idle_days_escalate` 3 · `plant.fuel_variance_pct` 15 · `dpr.cutoff_time` 11:00 next day · `duplicate.window_days` 30 · `stock.idle_days_dead` 180 · `approval.sla_hours` per document type · `tool.custody_overdue_days` 7 · `formwork.repetition_min` per system · `imprest.max_balance` per site.

### 9.5 Mandatory evidence matrix (configurable)
Work authorisation: current drawing revision, method statement (listed activities), active permit (hazardous work) · PR: plan/MRP reference, budget line · RFQ/CS: ≥ 3 quotations above threshold else single-source exception, technical compliance · PO/WO: approved CS or rate contract, T&C template, budget check · GRN: challan/invoice image, vehicle no., weighbridge ticket where applicable, material photo, e-way bill, batch/heat no., test certificate · Issue: approved requisition/WA, receiver OTP/signature · Transfer/return: reason, gate pass, receiving acknowledgement · Stock adjustment: physical verification sheet, investigation note above threshold · DPR: photos per activity, labour/plant counts, weather · MB: location/chainage, dimensions, drawing ref, photo for listed items · Bills: MB extracts, certification, deductions working · Vendor payment: match result, approved bill, TDS/GST check · Variation/claim: instruction or event notice, evidence bundle · Cancellation/reversal/modification: reason code + narrative + approval · Master change: source documents (GST certificate, PAN, cancelled cheque…).

### 9.6 Maker-checker
Applies to all master changes, journals, payments, stock adjustments, rate/price changes, permission and protocol configuration changes, threshold changes, exception approvals, cancellations and reversals. Same user never maker and checker; never two levels of one instance.

### 9.7 Escalation ladder
L0 actor nudge (gate failed / due soon) → L1 responsible owner (overdue / threshold breached) → L2 accountable manager — PM / HOD / Site Manager (SLA × 1 or HIGH) → L3 Management — Project Director / CFO / COO (SLA × 2, ≥ 3 repeats in 30 days, CRITICAL, emergency not regularised). Escalations are events, appear in control towers, de-escalate only on evidenced resolution.

### 9.8 Accountability
Action ledger for every controlled record: CREATED, SUBMITTED, VERIFIED, REVIEWED, APPROVED, REJECTED, RETURNED, MODIFIED, EXECUTED, RECORDED, RECONCILED, CLOSED, CANCELLED, REVERSED — with user, role, on-behalf-of, time, device, location, reason. RACI per company/department/project/site/WBS/process; **execution cannot start on a WBS/activity without Responsible and Accountable assigned**. Compliance score per user/role/site/project/department (rolling 30/90 days) = 100 − Σ(weight × violations) − late-record penalty − unregularised-emergency penalty + on-time bonus, bounded 0–100, transparent components, never automatic HR action (N23).

### 9.9 Detection rule catalogue (implemented in Part 77; each finding has owner, value at risk labelled CALCULATED — estimate, evidence, action)
DR-01 excess material consumption vs theoretical · DR-02 issue without matching execution · DR-03 stock leakage (book − physical) · DR-04 duplicate PR/PO · DR-05 duplicate vendor invoice/bill · DR-06 duplicate work recorded (activity + location twice in DPR/MB) · DR-07 idle labour · DR-08 low labour productivity (3 consecutive days) · DR-09 excess overtime / OT without planned work · DR-10 idle or under-utilised plant incl. hired plant still on hire · DR-11 fuel consumption anomaly · DR-12 budget leakage (wrong/unplanned cost code, cost without commitment) · DR-13 price leakage / split POs below approval band · DR-14 schedule delay and float erosion · DR-15 repeated unauthorised attempts · DR-16 rework cost by responsible party · DR-17 dead/slow stock · DR-18 over-/under-billing (billed > certified > measured; work done unbilled > N days) · DR-19 abnormal attendance (proxy, outside fence, impossible travel) · DR-20 expenses/imprest outside policy · DR-21 tool loss / overdue custody · DR-22 fuel tank/bowser variance · DR-23 fuel without meter movement or location mismatch · DR-24 excess inventory vs remaining requirement · DR-25 batch expiry risk · DR-26 RMC dispatched − poured − returned variance · DR-27 recurring defects in DLP · DR-28 formwork/scaffold shortage or loss beyond wear allowance · DR-29 weighbridge vs challan quantity mismatch · DR-30 vendor bank-detail change followed by payment within N days · DR-31 subcontractor bill quantity > certified MB · DR-32 BG/insurance expiry without renewal action · DR-33 daily fuel consumption outside calibrated benchmark tolerance, fuel without usage or trend drift (Part 51) · DR-34 equipment logbook anomalies — reading gaps, implausible usage, missing evidence, unauthorised or absent operator (Part 50A).
Lifecycle: NEW → ASSIGNED → UNDER_REVIEW → CONFIRMED (recovery, NCR, process fix, disciplinary note via HR review) | DISMISSED (reason).

### 9.10 Field protocol
Field users see gate status before they start ("WA-231 valid until 18:00 · material balance 12.5 MT · permit HW-14 active"). Gates evaluate on device against signed cached data offline and are re-evaluated on the server at sync; server result is authoritative; conflicts become findings.

### 9.11 Policy-generated protocol
Policies (Part 17) generate **draft** workflows, limits, evidence rules, tasks, escalation rules, retention rules, checklists, permissions and control points; validation blocks conflicts; anything touching permissions, financial authority, critical workflows, user access, contract or material controls needs authorised-administrator approval (maker ≠ checker) and starts in OBSERVE.

---

## §10 QUALITY, SECURITY AND NON-FUNCTIONAL STANDARD

### 10.1 Secure development (summary of SEC baseline; Parts 07, 08 build it, Part 83 certifies it)
Zero-trust pipeline **Authenticate → Authorise → Validate → Execute → Audit** for every request, job, socket event, import row and integration call · Argon2id (or existing bcrypt/scrypt) password hashing, MFA (TOTP/WebAuthn; mandatory for privileged, finance and approval roles), throttling and lockout, secure reset, idle/absolute session expiry, revocation · strict input schemas (unknown fields rejected), protection against injection, XSS, CSRF, SSRF (outbound allow-list), path traversal, mass assignment, prototype pollution, unsafe deserialisation · parameterised queries only, least-privilege DB accounts per service, TLS everywhere, encryption at rest, encrypted sensitive columns (bank details, PAN, Aadhaar reference, salary) · secrets in a vault with rotation, secret scanning pre-commit and CI · CSP, HSTS, frame-ancestors, SameSite/HttpOnly/Secure cookies, restrictive CORS · uploads validated by content, scanned, stored privately · mobile: keystore/keychain, encrypted local DB, remote wipe/revoke, verified deep links · real-time: authenticated sockets, server-side room authorisation · SAST, DAST, dependency, container, licence and secret scans in CI with blocking policy; SBOM per release; penetration test before production · security events streamed to monitoring.

### 10.2 Universal test gate (every Part)
Unit (rules, formulas with worked examples) · integration (API + DB + events + consumers) · contract tests for every published API/event · DB integrity (§7.6, pre-existing tables unchanged) · generated permission tests (each key × allowed role 200 × disallowed 403 × out-of-scope 403/filtered) · SoD tests · protocol matrix per CP (PASS, WARN with reason, EXCEPTION approved/rejected, BLOCK, emergency regularisation, escalation) in OBSERVE and ENFORCE · workflow paths · UI at 360×800, 820×1180, 1440×900, light/dark (+ high-contrast for field), axe accessibility, visual regression · offline/sync scenarios for field features · security tests (IDOR, injection, upload) · performance smoke against §10.3 · full regression (existing suite, golden outputs, earlier Parts' suites).

### 10.3 Non-functional targets (defaults; Part 09 measures, Part 83 certifies)
| Area | Target |
|---|---|
| API latency p95 | list (filtered, 100k rows) < 500 ms · record page < 1 s · search < 500 ms · `protocol.check` < 50 ms · calculation call < 100 ms |
| UI | first contentful paint < 2 s on 4G for field screens · dashboard < 3 s · grid with 50k BOQ lines usable via virtualisation |
| Real time | event to consumer ≤ 5 s · socket delivery ≤ 2 s |
| Reports | preview < 5 s; large exports asynchronous with notification |
| Scale (design point) | 50 companies · 1,000 concurrent projects · 20,000 named users · 3,000 concurrent · 200k BOQ lines per project · 10 M stock transactions/year · 5 M attendance punches/month · 100 GB documents/month |
| Availability | 99.9 % monthly for business hours-critical services; field app usable offline for 72 h |
| Recovery | RPO ≤ 15 min, RTO ≤ 4 h (Part 84) |
| Offline | 72 h of field capture, ≤ 500 MB device storage budget, sync of 1 day's DPR < 60 s on 3G |
| Accessibility | WCAG 2.2 AA |

### 10.4 Experience standard (full detail in Annex A)
One original design language ("Blueprint & Concrete"): semantic tokens only; one icon family via registry keys; page templates — Launchpad, List Report, Object Page, Worklist, Overview/Analytical, Wizard; object-page tabs **Details · Lines · Attachments · Approvals · Accountability · Timeline · Discussion · Related/Trace**; Gate-status panel and *Request exception* on controlled records; reason-code picker on cancel/reverse/modify; *Why?* drill-down on KPIs; status always icon + text; every screen implements loading, empty, validation, permission, error, offline and sync-conflict states with **what happened → why → what you can do** + correlation ID; mobile is designed, not shrunk (bottom navigation, card lists, steppers, 44 px targets, camera/GPS/QR, sunlight mode); Indian locale defaults with English, Hindi and configured regional languages.

---

## §11 PROGRAM DOCUMENTATION SET (repository `docs/erp-program/`)

`PROGRAM_RULES.md` (this constitution as adopted) · `EXISTING_SYSTEM_MAP.md`, `DB_ENTITY_MAP.csv`, `CALCULATION_REGISTRY.md`, `ITEM_LIKE_MASTERS.md`, `GOLDEN_OUTPUTS/` (Part 01) · `ARCHITECTURE.md`, `adr/` (Part 02) · `DB_EXTENSIONS.md`, `MIGRATION_LOG.md` (Part 03) · `DECISIONS.md`, `CONFLICTS.md` · `EVENT_CATALOGUE.md` · `PERMISSION_REGISTRY.md` · `PROTOCOL_REGISTER.md` (all CPs, modes, owners) · `POSTING_RULES.md` · `KPI_CATALOGUE.md`, `REPORT_CATALOGUE.md` · `RESPONSIBILITY_MATRIX.md` · `CHANGELOG.md` · `PROGRESS_REGISTER.csv` · `TRACEABILITY_MATRIX.csv` (roll-up) · `modules/<code>/{discovery.md, impact.md, plan.md, traceability.csv, evidence/, audit.md, completion.md, session-notes.md}` · `runbooks/`.

---

## §12 STANDARD PART TEMPLATE AND UNIVERSAL REQUIREMENTS

### 12.1 What every Part contains
**Header** (Part, phase, module code, flag, default mode, depends on, consumed by, legacy sources and aliases, risk, navigation, context load, session card) · **1** Objective & business outcomes · **2** Scope (in / out / boundaries with other Parts) · **3** Personas & responsibilities · **4** Discovery keywords & legacy aliases · **5** Functional requirements (`REQ-<CODE>-Fnn`) · **6** Rules (business rules, formulas, state rules; foundation Parts may split this into *Process / State machines / Rules*) · **7** Protocol control points · **8** Data model (entities; REUSE / EXTEND / NEW decided at discovery) · **9** APIs & events · **10** Screens & experience by device · **11** Reports, prints, dashboards & widgets · **12** Integrations (Part references) · **13** AI & automation (advisory only) · **14** Non-functional specifics · **15** Migration & legacy notes · **16** Acceptance criteria & test scenarios · **17** Delivery slices. Foundation Parts 01–04 add an architecture/decision section and therefore number one higher; the order is the same. Section names, not numbers, are the stable reference.

### 12.2 Universal requirements — apply to every Part without being restated
- **U1 Permissions:** keys registered in the permission registry; enforced at UI, API, service and data-access layers; deny by default; explicit deny wins; field masking for sensitive fields (rates in CS, margins, cost, salary, bank, PAN, Aadhaar reference, medical) in UI, API, exports, search, notifications, chat previews and AI context.
- **U2 Workflow:** document types and default workflows registered with Part 16; approved data locked; amendments versioned.
- **U3 Controls:** the Part's CPs registered with Part 17 in OBSERVE (legacy flows) or as the Part specifies (new flows); Gate-status panel, exception request and reason-code picker on affected screens; action-ledger hooks.
- **U4 Audit:** every create, update, soft delete, state change, approval, print, export and download of the Part's entities is audited (AC-12).
- **U5 Events & notifications:** events registered in the catalogue; notifications through templates (AC-10); no business data beyond the recipient's permission.
- **U6 Numbering:** document numbers from the numbering service (AC-6).
- **U7 Files:** through the document service (AC-9).
- **U8 Calculations:** through Part 22; formulas registered with golden tests.
- **U9 Masters:** references through Item Selector / central masters only.
- **U10 Excel:** template download, bulk entry, validation, preview, approval and import through Part 24 for every important master and transaction list.
- **U11 Print/PDF:** approved transactions printable through Part 20 templates with letterhead, number, revision, approval block, QR verification, "printed by/on", page X of Y, controlled-copy watermark.
- **U12 Reports & widgets:** registered in the report catalogue and widget registry; SA-labelled (AC-13); drill-down Company → Project → WBS → Activity → Transaction; exports audited.
- **U13 Search & navigation:** searchable objects and navigation entries registered; entries render only when the flag is ON, the user is permitted and the route is healthy.
- **U14 UX states & devices:** Annex A; field features use the offline engine (Part 14) when the Part says offline; otherwise screens show connectivity state and disable submission offline with drafts kept.
- **U15 Errors:** AC-4 envelope, correlation ID, no stack traces/SQL to clients, no empty catches or silent fallbacks.
- **U16 Performance:** server-side pagination, lazy loading, caching with event invalidation, background jobs for heavy work, indexes justified by query plans; §10.3 targets.
- **U17 Migration safety & backward compatibility:** §7; legacy screens stay reachable until replacements are accepted; legacy events bridged, not renamed.
- **U18 Feature flag & rollback:** `ff.<code>` default OFF in production, kill switch, rollback rehearsed (flag OFF + down-migration of this Part's objects only).
- **U19 Documentation:** update the §11 set, module README, OpenAPI, runbooks and user help.
- **U20 AI:** none required unless the Part says so; when enabled, read-only, permission-scoped tools through Part 79, outputs labelled AI INTERPRETATION.

### 12.3 Definition of Done (per Part)
All `REQ-<CODE>-Fnn` implemented on real data and traced at 100 % (or formally deferred with target Part) · U1–U20 satisfied · CPs registered, evaluated server-side on all paths and tested in OBSERVE and ENFORCE · universal test gate green · security acceptance (functional, security, authorisation, integration, regression, performance, backup/recovery, code review, dependency review) passed · no TODO/placeholder in production paths · documentation updated · rollback rehearsed · audit record signed · feature flag ready to enable.

---

## §13 MODEL PROFILE — EXECUTING WITH CLAUDE HAIKU 5.5

This pack is tuned for **Claude Haiku 5.5** as the coding agent: fast, precise and reliable when instructions are explicit, bounded and checkable. The rules below turn every Part into work Haiku can finish correctly inside one session.

### 13.1 Session shape (one slice per session)
1. **Load** exactly: this constitution, the Part file, and only the annex sections the Part's header lists under *Context load*. Do not load other Parts — read their published contracts in the repository (`EVENT_CATALOGUE.md`, OpenAPI, `PERMISSION_REGISTRY.md`) instead.
2. **Scope** one delivery slice (Part §17 / §18). A slice that will not fit in the 70,000-token working target is split into `S<n>a`, `S<n>b` and recorded in `plan.md`.
3. **Open** with the kick-off prompt in Annex E1 (XML-tagged). First output is always the *Discovery summary* (table) and *Plan* (lists) — never code.
4. **Close** with the completion report (Annex E2) or, if the slice is unfinished, the hand-over report (Annex E8). Never end a session silently.

### 13.2 Working rules for the agent
- **Search before reading, read narrowly.** Use code search for the Part's keywords and legacy aliases; open only the files and line ranges you need; summarise long outputs into `session-notes.md`.
- **Follow the numbered order** of §5.5 inside every slice; do not reorder steps to "save time".
- **Copy identifiers exactly** (REQ, CP, DR, permission keys, events, routes, table names). Never invent a second name for an existing thing; check the catalogues first.
- **Write the failing test first** for every formula, control point and invariant, then the code (golden tests for Part 22 formulas).
- **Make the smallest compatible change** (§5.3). Prefer extension tables, new endpoints and adapters to edits of existing code paths.
- **Be explicit about uncertainty.** If a requirement is ambiguous, the repository contradicts the Part, or a rule in §4 would be broken: write it to `CONFLICTS.md`, stop that item, continue the rest, and list it in the report. Never guess on money, quantity, permission, deletion or schema change.
- **No placeholders.** If a dependency is not live, build the documented adapter (AC-1) — not a stub that returns fake data.
- **Self-check before reporting** with the checklist in §13.4; report failures honestly.

### 13.3 Output formats Haiku must use
| Moment | Format |
|---|---|
| Discovery summary | Markdown table: *Requirement / entity · Existing artefact · Decision · Reason · Risk* |
| Plan | Numbered lists per §5.4 heading (migrations, APIs, events, permissions, CPs, screens, tests, adapters, rollback) |
| Conflict | `CONFLICTS.md` entry: *ID · Part · what · where · options · recommendation · decision needed from* |
| Completion | Annex E2 template, every field filled (write "none" rather than omitting) |
| Hand-over | Annex E8 template: done, in progress (file/line), next step, open questions |

### 13.4 Self-check before any completion report
- [ ] Every `REQ-<CODE>-Fnn` of the slice has a row in `traceability.csv` with test ID and evidence path.
- [ ] Schema diff on pre-existing tables is EMPTY (or an approved §7.4 step is referenced).
- [ ] Every new endpoint is in the route registry with permission key, scope rule and schema; generated permission tests pass.
- [ ] Every controllable service action calls `protocol.check` and writes the action ledger; CP matrix tested in OBSERVE and ENFORCE.
- [ ] Every money/quantity value comes from a registered Part 22 formula; no business arithmetic in UI code.
- [ ] Every screen uses the Part 12 shell, tokens, registry icons and states (loading, empty, error, permission, offline).
- [ ] Events are in `EVENT_CATALOGUE.md`; notifications use templates; numbers come from the numbering service.
- [ ] Full regression and golden outputs green; rollback (flag OFF + down-migration) rehearsed.

### 13.5 Context hygiene
Keep `docs/erp-program/modules/<code>/session-notes.md` current (decisions, file map, open items). Start every later session of the same Part by reading `plan.md` and `session-notes.md` instead of re-reading the repository. When context reaches ~70,000 tokens: stop, write notes, issue the hand-over report.

---

## §14 EXECUTING PART 00
Part 00 is the governing document; it has no separate coding session. Its one real deliverable — **adopting the program in the repository** — is executed as the first requirements of Part 01 (REQ-DISC-F01 bootstrap and REQ-DISC-F17 legacy-pack reconciliation), in the same session:
1. `docs/erp-program/` with the §11 documentation set and `PROGRAM_RULES.md` (this constitution, version, adoption date).
2. Legacy records created under the old pack (old prompt numbers, `part-NNN`, `pNNN`) mapped to new Parts with Annex D and `LEGACY_CROSSWALK.csv` in `LEGACY_MAPPING.md` — old files are kept, never renamed.
3. `PROGRESS_REGISTER.csv` seeded from the pack's register with each Part's default mode (Annex C) and evidence links for legacy-built work.
4. Conventions (§1.3) and the CI rules "no business arithmetic outside Part 22", "no direct provider/government calls outside their services" and "no fixtures in production builds" recorded as items owned by Part 04.
5. Adoption recorded in `DECISIONS.md` and signed by the owner. Part 00 is APPROVED when this is done; every later Part depends on it implicitly.
