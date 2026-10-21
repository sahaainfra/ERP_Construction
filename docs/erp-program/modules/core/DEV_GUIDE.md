# Developer guide: shared kernel (Part 05)

This guide is for engineers who build modules on the shared kernel in `src/core/`. Read it with `docs/erp-program/DB_EXTENSIONS.md` (the tables) and `ERROR_CODES.md` (the error envelope).

## 1. The rules
1. **Scope comes from the server.** Build the request context with `buildContext` from a verified session. Never copy a company, project or site id from a request body, header or URL into the context. Treat it as a request and re-authorise it.
2. **Every business write goes through `runUnitOfWork`.** It commits the write, the audit entry, the action-ledger row, the protocol evaluation and the outbox event in one transaction. A failure leaves none of them.
3. **Every write that must not repeat goes through `idempotent`.** Use a key from the client (`newIdempotencyKey` in `client.ts`). The same key with a different body returns `IDEMPOTENCY_PAYLOAD_MISMATCH` (422).
4. **Numbers come from `allocateNumber`, inside the unit of work.** Voids use `voidNumber` with a reason of at least 10 characters. A number is never reused.
5. **Errors are `AppError`.** Pick a code from `ERROR_CATALOGUE`. The envelope hides internal detail; log that detail server-side.
6. **Money is decimal and paise.** Use `commercial.ts` for Annex B formulas. Money leaves a function rounded to paise. Dates are ISO `YYYY-MM-DD` strings (`calendar.ts`).
7. **Business-impacting configuration needs a second approver.** `setSetting` refuses a change to a business-impacting key unless `approvedBy` is someone other than the requester.
8. **Controlled methods declare their stages.** Use `controlled({ name, trigger, stages }, fn)` from `hooks.ts`. Declarations must include `authorize` and `protocol.check` before `persist`.

## 2. A worked example: the reference module
`src/core/sample.ts` is the reference. Read it top to bottom. It does, in order:
- checks the feature flag (`isEnabled`; off means `NOT_FOUND`);
- validates the input and returns `VALIDATION_FAILED` with field errors;
- wraps the write in `idempotent`, then `runUnitOfWork`;
- inserts the row, allocates a number, and records the audit, ledger, evaluation and event;
- enqueues a job after the commit, with its own key.

It is hidden behind `ff.core.sample`. The flag is off in every environment by default and is never enabled in production. Copy its shape, not its name.

## 3. Jobs
`enqueueJob` queues work with an idempotency key. `claimJobs` takes runnable jobs for one tenant with `SKIP LOCKED`. Call `completeJob` on success. On failure call `failJob`: the job retries with backoff (30 s, 60 s, 120 s … capped at one hour) until its maximum attempts, then becomes `dead`. Dead jobs are kept, never deleted.

A job runs under a service principal (`servicePrincipalContext`) with an explicit permission list. It passes the same controlled-method declarations as an API call.

## 4. Configuration and flags
- Read a setting with `resolveSetting(pool, ctx, key, scopes)`. The most specific scope wins: user, site, project, branch, legal entity, company, tenant. The registry default applies last.
- Gate a feature with `isEnabled(flag, env, ctx)`. Flags are listed in `docs/erp-program/feature-flags.json`. Every flag needs an owner, a kill switch and a default of off in production.

## 5. Files
`LocalObjectStorage` (`storage.ts`) stores immutable objects under an allow-listed key shape, with a SHA-256 check on read. It is for development and tests. Object storage needs a provider (CF-012, CF-027).

## 6. Health
`GET /health/live` answers when the process runs and never touches the database. `GET /health/ready` checks the database and reports the other components as `not_configured` or `in_process`.

## 7. Tests
- Pure tests: `npx vitest run src/core/core.test.ts src/core/extensions.test.ts`.
- Database tests need `.env.test` (see LOCALHOST.md): `npx vitest run src/core/core.integration.test.ts`.
- A module that uses the kernel tests: the rollback path (no rows after a forced failure), the replay path (same key, no duplicate), the flag path (off means absent), and the tenant path (another tenant cannot see the rows).

## 8. Not yet available
- Calendar API and holiday import (need authentication, Part 07).
- Service hook decorator wired to a framework (the declaration exists; Parts 07 and 17 enforce it).
- Redis-backed cache and rate limit, object storage with signed URLs and encryption (CF-027).
- Hindi translations are drafts pending review.
