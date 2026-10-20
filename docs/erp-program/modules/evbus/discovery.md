# Part 10 — Event bus, real-time and notification engine: discovery, plan and execution prompt

Status: **discovery and plan only. No code.** Part 10 is not yet approved by the owner (Part 00 §1.2). Build of slice S1 waits for that approval. Risk is High, so an independent human review is mandatory (Part 00 §5.8).

Dependencies (Part 00 §1.2): Part 05 (approved), Part 07 (approved with conditions, D-054), Part 08 (approved, D-058). All three are met.

## 1. Discovery summary

| Area | Present | Where | Gap against Part 10 |
|---|---|---|---|
| Transactional outbox | `enqueueEvent` writes `sys.outbox` inside the caller's transaction; event type must match `<code>.<entity>.<past_tense_verb>` | `src/db/outbox.ts`, `db/migrations/202610191230_dbf_sys_operations.up.sql` | Written by `runUnitOfWork` only when a service calls `uow.emit`. No static check yet that business writes go through it (CP-EVBUS-01) |
| Outbox relay | `relayBatch` locks rows with `SKIP LOCKED`, calls `publish`, marks `published_at`; attempts counted on failure | `src/db/outbox.ts` | No scheduler, no consumer, no lag metric. Publishing is a callback; nothing publishes yet |
| Inbox | None | — | Full gap (REQ-EVBUS-F03). Needed for idempotent consumers |
| Broker | None installed. The job queue is database-backed (`core_jobs`, SKIP LOCKED, backoff, dead state) | `src/core/jobs.ts` | ADR-006 (accepted) names a Redis-backed BullMQ queue. Redis and BullMQ are not installed or provisioned (TECH_RADAR: ADOPT for Redis, ASSESS for BullMQ). Conflict, see §2 |
| Hooks | `emit` and `notify` are declared stages | `src/core/hooks.ts` | Declaration only; no notification engine behind `notify` |
| Schema registry | None | — | Full gap (REQ-EVBUS-F05). JSON Schema validation needs a library; see §2 |
| Dead-letter and replay | `core_jobs` dead state only | `src/core/jobs.ts` | Full gap for events (REQ-EVBUS-F06) |
| Webhooks | None | — | Full gap (REQ-EVBUS-F07). Part 11 owns partner onboarding |
| Real-time | None. Socket.IO is HOLD on TECH_RADAR: "Part 10 decides with ADR" | `docs/erp-program/TECH_RADAR.md` | Full gap (REQ-EVBUS-F10 to F13). Decision needed, see §2 |
| Authorisation for rooms | `can()` and `scopePredicate` in the permission engine | `src/iam/pdp.ts`, `src/iam/policy.ts` | Reusable for room joins; no room layer yet |
| Notifications | None. `notify` hook only | `src/core/hooks.ts` | Full gap (REQ-EVBUS-F15 to F18). Delivery to external channels belongs to Part 25 |
| Audit | Hash-chained audit with `writeAudit` | `src/secgov/audit.ts` | Event delivery is not audited; replay must be (REQ-EVBUS-F06) |
| Security events | Part 08 S2 rules and status | `src/secgov/security.ts` | Can be published as events once the outbox relay exists |
| Legacy bridge | No legacy event names in the repository ("legacy evidence not in repository", PROGRESS_REGISTER) | — | Legacy socket events cannot be bridged from evidence; owner input needed |

Open conflicts that touch this part: **CF-012** (cloud provider and region, assumed AWS ap-south-1 under A-02). It decides where Redis and any socket server run. **CF-013** (identity provider) affects the socket handshake token source. ADR-006 is accepted, so its Redis choice stands until the owner changes it.

## 2. Decisions needed from the owner (minimum)

These cannot be made safely by assumption, because each one changes infrastructure or a dependency that the owner must approve.

1. **Broker runtime (ADR-006 vs the current database queue).** Options:
   - (a) Build the outbox relay and the inbox on PostgreSQL first (the existing `sys.outbox` and `core_jobs` patterns), behind the broker abstraction (REQ-EVBUS-F04). Add a Redis/BullMQ adapter when Redis is provisioned in the chosen region (CF-012). **Recommended.** It keeps ADR-006's design, needs no new infrastructure to start, and the adapter is the only thing that changes.
   - (b) Provision Redis and BullMQ now. This needs CF-012 closed and a new ADR for the BullMQ version and its licence check.
2. **Real-time transport (Socket.IO is on HOLD).** Options:
   - (a) Server-Sent Events from Next.js route handlers for server-to-client updates, with the existing HTTP API for client actions. No new package, works behind standard load balancers, and needs no sticky sessions for a fan-out that is one-way. Cross-instance fan-out needs the Redis or PostgreSQL LISTEN/NOTIFY backplane. **Recommended for S3.**
   - (b) Socket.IO with a Redis adapter, as the Part 10 text suggests. Needs an ADR, a licence and maintenance check, and sticky sessions or the adapter. Choose it only if bidirectional traffic (typing, presence) is a proven requirement, which WorkChat (Part 25) will decide.
3. **JSON Schema validator for the registry (REQ-EVBUS-F05).** Options: adopt a validator such as `ajv` (MIT) under a new ADR, or ship a small in-house subset for the types we use. **Recommended: ADR for `ajv`.** Until accepted, S2 stores schemas and checks only type and required fields in code.
4. **Financial and stock replay approver.** CP-EVBUS-03 needs a named Finance controller role. The owner names the role and who holds it, or confirms the existing role code from Part 07.
5. **Mandatory notification categories (REQ-EVBUS-F15).** The plan uses: escalation, approval-required, safety incident, payment released, security alert. The owner confirms or changes the list.
6. **Latency SLOs (REQ-EVBUS-F14).** The plan uses ≤ 5 s producer-to-consumer and ≤ 2 s socket delivery, from Part 10 §5. The CTO confirms them (A-53).
7. **Legacy socket event names to bridge.** None are in the repository. The owner supplies them, or confirms there are none.

## 3. Assumptions proposed for Part 10

Proposals, recorded in `ASSUMPTIONS.md` only when the owner approves Part 10.

- **A-46 Broker.** Until §2.1 is decided, the relay and the inbox use PostgreSQL. The broker interface is the only module-facing API (REQ-EVBUS-F04); no module imports a broker SDK.
- **A-47 Ordering.** Per-aggregate ordering only (ADR-006 consequence). The ordering key is the document or project id stored in the envelope.
- **A-48 Envelope.** The AC-5 envelope: `eventId`, `eventType`, `schemaVersion`, `tenantId`, `occurredAt`, `aggregateKey`, `idempotencyKey`, `causationId`, `correlationId` (from Part 09 S1), `links` (permission-checked URLs), `payload` (no sensitive values; PII fields flagged in the registry).
- **A-49 Webhooks.** HMAC-SHA256 over `timestamp.body`, five-minute tolerance, secret rotation with two active secrets for 24 hours, auto-suspend after 20 consecutive failures.
- **A-50 Retries.** Exponential backoff with full jitter, base 30 s, cap 1 h, six attempts; then DLQ. Consistent with `backoffSeconds` in `src/core/jobs.ts`.
- **A-51 Notification retention.** In-app notifications are kept 90 days, then archived. Delivery log 1 year.
- **A-52 Digest and quiet hours.** Digest windows hourly and daily (09:00 local). Quiet hours 21:00 to 07:00 local by default, not applied to Critical or Escalation.
- **A-53 Latency SLOs.** From Part 10 §5: consumer ≤ 5 s, socket ≤ 2 s at p95, proposed until the CTO confirms.
- **A-54 Real-time transport.** Server-Sent Events first (§2.2a). Socket.IO deferred to an ADR.
- **A-55 Presence.** Presence is advisory and expires after 60 s without a heartbeat. It is never used for access decisions.
- **A-56 Replay window.** Missed-event replay covers the last 15 minutes or 500 events, whichever is smaller; older clients refetch through the API.

## 4. Execution phases, deliverables and gates

Each phase is one session (Part 00 §12, Annex E1). A phase starts only when the previous phase's gates are green and the owner has approved the phase where Part 00 requires it.

**Phase 0 — Discovery and plan (this session).** Deliverables: this document; PROGRESS_REGISTER status for `evbus`. Gate: none (no code). Stop and report.

**Phase 1 — S1 Envelope, outbox relay, inbox, broker adapter.** Deliverables:
- Envelope type and builder, with the correlation fields from Part 09 S1 (`src/evbus/envelope.ts`).
- Relay scheduler that runs `relayBatch` through the broker interface, with lag metrics (`route_requests_total` pattern from Part 09 S1).
- Inbox table `evt_inbox` (consumer, event_id unique) and an `inboxProcess` helper that applies the business effect and the inbox row in one transaction, so a replay cannot double-apply (REQ-EVBUS-F03).
- Broker interface and the PostgreSQL adapter (§2.1a); no module imports a broker SDK (REQ-EVBUS-F04).
- Static check that every `uow.emit` is inside `runUnitOfWork` and that no service writes to `sys.outbox` directly (CP-EVBUS-01).
- Tests: business rollback publishes no event; duplicate delivery has no second effect (acceptance §16).

Gates: `npm run check:all` 9 of 9; the two acceptance tests above.

**Phase 2 — S2 Schema registry, DLQ and replay, webhooks.** Deliverables: `evt_schema_registry`, `evt_consumers`, `evt_dlq`, `evt_replays`, `evt_webhook_subscriptions`, `evt_webhook_deliveries` (additive migrations with down scripts and DB_EXTENSIONS rows); compatibility check that rejects a breaking change inside a major version (CP-EVBUS-02); DLQ with reason and payload hash; replay per consumer, time and aggregate with dry-run diff; financial and stock replay needs an approval by the §2.4 role after the dry-run (CP-EVBUS-03); webhooks with signing, tolerance, rotation, rate limit and auto-suspend (REQ-EVBUS-F07).

Gates: check:all; breaking schema change rejected; DLQ message replayed after a fix with a dry-run diff shown first; a replay of a financial event without approval is refused.

**Phase 3 — S3 Real-time: SSE, rooms, replay, presence.** Deliverables: authenticated SSE endpoint using the same session as the API (REQ-EVBUS-F10); room model `user:`, `project:`, `site:`, `dept:`, `role:<code>@<scope>`, `doc:<type>:<id>`, joined only after a permission check and re-evaluated on allocation or role change (REQ-EVBUS-F11); disconnect on revocation (wired to Part 08 session revocation); missed-event replay `since=<lastEventId>` within the A-56 window, filtered by permission (REQ-EVBUS-F12); presence and optimistic-lock edit warning (REQ-EVBUS-F13); per-user connection limit; minimal payloads, clients refetch.

Gates: check:all; a user removed from a project stops receiving that project's events immediately and replay excludes them (acceptance §16); two tabs share one stream (leader tab with BroadcastChannel).

**Phase 4 — S4 Propagation map and latency SLOs.** Deliverables: `rt_propagation_map` seeded for every event in REQ-EVBUS-F08 with its consumers and UI effects; `rt_latency_samples` partitioned (additive); lag and latency dashboards on the Technical Console; alerts at the A-53 thresholds; failure isolation per consumer (one consumer's failure does not block another).

Gates: check:all; each seed propagation example asserted end to end within the A-53 SLO in a test environment.

**Phase 5 — S5 Notification engine, templates, centre, preferences, digests.** Deliverables: `notify()` with recipients by user, role-in-scope, RACI or audience rule; levels Information, Action required, Warning, Critical, Escalation; dedup window; digests; quiet hours (A-52); mandatory categories that cannot be muted (§2.5); fallback channel rules through the Part 25 gateway adapter (in-app first; the external adapter is a stub until Part 25 is approved); versioned templates with locale variants and permission-aware rendering; notification centre and preferences; `ntf_*` tables with partitioning for notifications and deliveries (additive). Notifications never contain data the recipient may not view (Part 10 §6).

Gates: check:all; a Critical notification falls back to an alternate channel on failure; an escalation category cannot be muted; a burst of 50 notifications produces at most one digest entry per window.

**Out of this Part's build:** WorkChat real-time (REQ-EVBUS-F19: `msg:*` namespace, single-use connection tokens, device push tokens, lock-screen rules). It depends on Parts 25 and 25A, which are not approved. It is recorded as deferred, not built here.

**Final gate for Part 10 (before the owner approves the part).** Independent human review (Part 00 §5.8); acceptance scenarios in Part 10 §16 each with evidence; every open finding either fixed or accepted by the owner.

## 5. Reporting format (required for every phase)

Each session closes with this report, in this order. Missing items mean the phase is not complete.

1. **Phase and slice:** for example `Part 10 · S1`.
2. **Outcome:** one line, stated plainly: built, partly built, blocked, or planned only.
3. **Deliverables:** a list, each with the file or route path and the requirement id (REQ-EVBUS-Fxx or CP-EVBUS-xx).
4. **Assumptions and decisions:** the new assumption ids (A-46 onward) and decision ids (D-xxx). Nothing is recorded as approved unless the owner approved it.
5. **Evidence:** the exact command and its result for each gate: `npm run check:all` (x of 9 passed), the named tests, and any replay or latency results. Failures are quoted, not summarised away.
6. **Not built and why:** each item from the phase plan that is not done, with the reason.
7. **Owner items:** each question that needs the owner, with the minimum information needed to answer it.
8. **Next step:** the next phase, and whether it needs approval first.

Documentation updated in the same session: `ASSUMPTIONS.md`, `DECISIONS.md` (only for owner-approved items), `CHANGELOG.md`, `DB_EXTENSIONS.md` (for each migration), `modules/evbus/traceability.csv`, `PROGRESS_REGISTER.csv` (via `npm run adopt:program`).

## 6. Enhanced execution prompt for Part 10

Use this with Annex E1 at the start of each Part 10 session. The universal requirements U1–U20 (Part 00 §12.2) apply without being restated.

> You are a senior full-stack developer and enterprise architect working on the ERP in `/home/user/ERP_Construction`, branch `claude/bold-allen-rj3t08`.
>
> 1. Read `modules/evbus/discovery.md`, Part 10, ADR-006 and the Part 00 sections it cites. Inspect `src/db/outbox.ts`, `src/core/jobs.ts`, `src/core/hooks.ts` and `src/iam/pdp.ts` before you change anything.
> 2. Work on one slice only. Phase 0 produces a discovery summary and plan and no code.
> 3. Do not add a package without an ADR (CP-ARCH-01). If a slice needs one, stop and ask for the ADR.
> 4. Record every assumption you make, with an id from A-46 onward. Record an owner decision only when the owner has given it in their own words.
> 5. Every business event is written through the outbox inside the business transaction. Every consumer is idempotent through the inbox.
> 6. Preserve working behaviour. Additive, backward-compatible changes only. Any migration ships with a down script, a DB_EXTENSIONS row and an entry in the migration list test.
> 7. Stop and report when a change is destructive, replaces existing code, or conflicts with a documented decision.
> 8. Run `npm run check:all` with the database running and `.env.test` loaded. Do not commit on a failing run.
> 9. Close the session with the reporting format in §5 of this document.
