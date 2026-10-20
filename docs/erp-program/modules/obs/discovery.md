# Part 09 — Observability, Reliability, Performance and Error Handling: discovery, plan and execution prompt

Status: **discovery and plan only. No code.** Part 09 is not yet approved by the owner (Part 00 §1.2). Build of slice S1 waits for that approval. Risk is High, so an independent human review is mandatory (Part 00 §5.8).

Dependencies (Part 00 §1.2): Part 04 (approved, D-036–D-038), Part 05 (approved), Part 08 (approved, D-058). All three are met.

## 1. Discovery summary

What exists today (inspected in this session):

| Area | Present | Where | Gap against Part 09 |
|---|---|---|---|
| Structured logs | JSON lines, level filter, per-module child loggers, correlation id binding | `src/core/logger.ts` | No trace/span ids, no duration or outcome fields as a standard set, writes to stdout only |
| Redaction | Key-name based (`password`, `token`, `pan`, `aadhaar`, `account`, `phone`, `email` …), depth-limited | `src/core/logger.ts` (`redact`) | **Value-based redaction missing.** A PAN, Aadhaar, phone or JWT inside a free-text message or an unlisted key is not removed. Needs CP-OBS-04 scanner |
| Correlation header | `X-Correlation-Id` constant and request headers | `src/core/client.ts`, `src/core/context.ts` (`correlationId`, `causationId`) | Not propagated to jobs, outbox, socket events, integration calls, sync batches, imports or AI calls (REQ-OBS-F01). Not written to logs or traces by a middleware |
| Error envelope | `AppError`, `ERROR_CATALOGUE` (13 codes), envelope with `correlationId` | `src/core/errors.ts`, `docs/erp-program/ERROR_CODES.md` | Taxonomy not the Part 09 list (VALIDATION, PERMISSION, CONFLICT, NOT_FOUND, BUSINESS_RULE, CONTROL_BLOCKED, EXCEPTION_REQUIRED, INTEGRATION, TIMEOUT, DEPENDENCY_DOWN, SYNC_CONFLICT, INTERNAL). No per-module catalogue, no `obs_error_catalog` |
| Error docs | Generated/checked error doc | `src/core/error-docs.ts` | Check it covers new codes when they are added |
| Health | `live` and `ready` route handlers | `src/app/health/live`, `src/app/health/ready` | `ready` does not yet check database, queue, storage with timeouts (assumed in A-41) |
| Rate limiting | Token buckets per tenant and subject | `src/core/rate-limit.ts` | Not wired to outbound calls; no bulkheads |
| Cache | Tenant-keyed cache | `src/core/cache.ts` | No event-driven invalidation; no metrics |
| Jobs | Job queue with service principal context | `src/core/jobs.ts` | No depth, oldest-age, retry, DLQ or schedule-miss metrics |
| Idempotency and retries | Idempotency store | `src/db/idempotency.ts`, `src/core/idempotency.ts` | No retry-with-jitter library; no timeouts on outbound calls (none exist yet to measure) |
| Audit | Hash-chained audit (Part 08 S1) | `src/secgov/audit.ts` | Audit is the record of business change; telemetry is separate (ADR-level rule in Part 09 §6) |
| Security events | Login history and security events (Part 08 S2) | `src/secgov/security.ts` | Feeds Part 09 alerting only through the outbox; not yet connected |
| Metrics | None | — | Full gap (REQ-OBS-F03) |
| Tracing | None | — | Full gap (REQ-OBS-F04) |
| SLOs, synthetic, RUM, incidents | None | — | Full gap (REQ-OBS-F05, F06, F08) |
| Performance tooling | Volume generator and golden baseline from Part 04 | `scripts/`, `docs/erp-program/GOLDEN_OUTPUTS` | No load, soak or spike kit (REQ-OBS-F10) |
| Fault injection | None | — | Full gap (REQ-OBS-F12) |
| Dependencies | Next.js 15.5.28, React 19.1.0, pg 8.x, decimal.js 10.6.0, lucide-react | `package.json` | No telemetry, metrics or resilience library. Any addition needs `docs/erp-program/DEPENDENCY_ALLOWLIST.json` entry |

Open conflicts that touch this part: **CF-012** (cloud provider and region, assumed AWS ap-south-1 under A-02, not confirmed) decides where telemetry may be stored. **CF-013** (identity provider) affects user-hash fields in logs. No legacy observability evidence exists in the repository ("legacy evidence not in repository", `PROGRESS_REGISTER.csv`).

## 2. Assumptions proposed for Part 09

These are proposals. They are recorded in `ASSUMPTIONS.md` only when the owner approves Part 09.

- **A-36 Telemetry standard.** OpenTelemetry API and SDK (Apache-2.0) for traces and metrics. Export by OTLP to a collector in the same region as the data. No third-party SaaS APM is used until CF-012 and a residency review are closed.
- **A-37 Metrics.** `prom-client` (Apache-2.0) with RED and USE metrics, exposed only on the Technical Console route, never public.
- **A-38 Resilience.** Timeouts, retries with jitter (idempotent operations only), circuit breakers and bulkheads are written in `src/core/resilience.ts`. A library such as `opossum` (Apache-2.0) is evaluated at S4; it is adopted only with an allowlist entry and a licence and maintenance check.
- **A-39 Redaction.** Value-pattern detection added to the logger sink: PAN, Aadhaar (with Verhoeff checksum, to cut false positives), phone, email, bearer and JWT tokens, OTP-like six-digit values next to OTP words. Tests prove no value reaches a sink.
- **A-40 SLO targets.** Numeric targets in this plan are starting proposals. None is approved until the CTO (SLO owner) confirms it. Error budgets are computed from them only after confirmation.
- **A-41 Health.** `ready` checks the database, queue and storage, each with a timeout of 2 seconds. `live` checks only the process.
- **A-42 Error taxonomy.** The Part 09 categories become a `category` field on every `ERROR_CATALOGUE` entry. Existing codes keep their names and HTTP status (no breaking change to clients).
- **A-43 Telemetry storage.** Telemetry is outside the business database (Part 09 §8). The technical tables `obs_*` are the only exception, and they hold no personal data.
- **A-44 Sampling.** Head sampling at 10 % for routes, 100 % for errors and for the synthetic journeys, adaptive when CPU overhead exceeds 3 % (Part 09 §14).

## 3. Execution phases, deliverables and gates

Each phase is one session (Part 00 §12, Annex E1). A phase starts only when the previous phase's gates are green and the owner has approved the phase where Part 00 requires it.

**Phase 0 — Discovery and plan (this session).** Deliverables: this document; PROGRESS_REGISTER status for `09`. Gate: none (no code). Stop and report.

**Phase 1 — S1 Correlation, logs, metrics, traces.** Deliverables:
- Correlation middleware for web, API and job entry points. Propagation to jobs, outbox, socket events, integration calls and sync batches (REQ-OBS-F01).
- Logger sink with value-pattern redaction (A-39) and tests with fixtures for PAN, Aadhaar, phone, email and token.
- `/api/v1/obs/metrics` (Technical Console only) with RED metrics per route and job, DB pool metrics.
- Trace spans web → API → service → DB; sampling per A-44.
- Telemetry contract test (CP-OBS-01): every new route and job emits a correlated log, a metric and a span.

Gates: `npm run check:all` 9 of 9; redaction test; telemetry contract test. Owner approval required before S2 starts.

**Phase 2 — S2 SLOs, synthetic monitoring, RUM, alerting, incidents.** Deliverables: `obs_slos` and `obs_incidents` tables (additive migration with down script and DB_EXTENSIONS rows); burn-rate rules for the SLO catalogue (REQ-OBS-F05, with targets awaiting CTO confirmation per A-40); incident register API (SEV1–SEV4, timeline, RCA, actions); `obs.slo.burn_alert` and `obs.incident.opened|closed` events through the outbox; synthetic journey scripts, which run in staging only until CF-012 closes. CP-OBS-05 enforced: SEV1 and SEV2 cannot close without a post-incident review.

Gates: check:all 9 of 9; burn-rate test on injected latency fires an alert with a runbook link (acceptance §16).

**Phase 3 — S3 Performance playbook, read models and replica routing, load kit.** Deliverables: load, soak and spike scripts using the Part 04 volume generator (REQ-OBS-F10); performance budgets per page template; `obs_perf_runs` table; `protocol.check` p95 under 50 ms and gate-status API under 300 ms measured (CP-OBS-02). Read-model and replica routing are designed here and built only where a measured budget fails. Any new index is additive and needs Part 03 approval.

Gates: check:all; load test on the volume dataset meets the Part 00 §10.3 budgets; a failing budget blocks the release (CP-OBS-02).

**Phase 4 — S4 Resilience library and fault injection.** Deliverables: `src/core/resilience.ts` (timeout, retry with jitter, circuit breaker, bulkhead, back-pressure) per A-38; fault injection harness, non-production only, for DB slowdown, queue down, socket down, storage down, government API down and AI provider down (REQ-OBS-F12); user-facing states verified for each.

Gates: check:all; fault injection for an integration down shows the integration-failure state with retry information, no data loss, circuit opens and closes (acceptance §16).

**Phase 5 — S5 Error taxonomy, catalogue, UI state contract, support lookup.** Deliverables: Part 09 categories added per A-42; `obs_error_catalog` and per-module catalogue entries (code, localisable message key, cause key, action key, HTTP status); shared UI state components (loading, empty, validation, permission, error, offline, sync-conflict, integration failure, background-job failure) per REQ-OBS-F14; correlation lookup for support roles with personal data masked (`GET /api/v1/obs/correlation/{id}`, REQ-OBS-F15); UI audit against CP-OBS-06.

Gates: check:all; UI audit; redaction scanner shows no leak in the support lookup.

**Final gate for Part 09 (before the owner approves the part).** Independent human review (Part 00 §5.8); acceptance scenarios in Part 09 §16 each with evidence; every open finding in the review record either fixed or accepted by the owner.

## 4. Reporting format (required for every phase)

Each session closes with this report, in this order. Missing items mean the phase is not complete.

1. **Phase and slice:** for example `Part 09 · S1`.
2. **Outcome:** one line, stated plainly: built, partly built, blocked, or planned only.
3. **Deliverables:** a list, each with the file or route path and the requirement id (REQ-OBS-Fxx or CP-OBS-xx).
4. **Assumptions and decisions:** the new assumption ids (A-36 onward) and decision ids (D-xxx). Nothing is recorded as approved unless the owner approved it.
5. **Evidence:** the exact command and its result for each gate: `npm run check:all` (x of 9 passed), the named tests, and the load or fault results where they apply. Failures are quoted, not summarised away.
6. **Not built and why:** each item from the phase plan that is not done, with the reason.
7. **Owner items:** each question that needs the owner, with the minimum information needed to answer it (for example CF-012 region, CTO SLO targets).
8. **Next step:** the next phase, and whether it needs approval first.

Documentation updated in the same session: `ASSUMPTIONS.md`, `DECISIONS.md` (only for owner-approved items), `CHANGELOG.md`, `DB_EXTENSIONS.md` (for each migration), `modules/obs/traceability.csv`, `PROGRESS_REGISTER.csv` (via `npm run adopt:program`).

## 5. Enhanced execution prompt for Part 09

Use this with Annex E1 at the start of each Part 09 session. The universal requirements U1–U20 (Part 00 §12.2) apply without being restated.

> You are a senior full-stack developer and enterprise architect working on the ERP in `/home/user/ERP_Construction`, branch `claude/bold-allen-rj3t08`.
>
> 1. Read this document, Part 09, and the Part 00 constitution sections it cites. Inspect the code it names before you change anything.
> 2. Work on one slice only. Phase 0 produces a discovery summary and plan and no code.
> 3. Record every assumption you make, with an id from A-36 onward. Record an owner decision only when the owner has given it in their own words.
> 4. Preserve working behaviour. Use additive, backward-compatible changes. Any migration ships with a down script, a DB_EXTENSIONS row and an entry in the migration list test.
> 5. Stop and report when a change is destructive, replaces existing code, or conflicts with a documented decision.
> 6. Run `npm run check:all` with the database running and `.env.test` loaded. Do not commit on a failing run.
> 7. Close the session with the reporting format in §4 of this document.

## 6. Requests to the owner (minimum needed)

1. Approve Part 09 for the phases in §3, or name the changes you want first.
2. Confirm the CTO as SLO owner, and confirm or change the proposed targets (A-40). Targets are needed before Phase 2 can be signed off.
3. CF-012 (cloud provider and region) must be confirmed before telemetry leaves the development environment (A-36, A-43).
4. Name the independent human reviewer for Part 09 (Part 00 §5.8).
