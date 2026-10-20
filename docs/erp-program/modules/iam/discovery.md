# Part 07 discovery, plan and delivery record

Module `iam`. Part 07 — Identity, Access Control, Segregation of Duties & Zero-Trust. Status: **slice S2 APPROVED by the owner 2026-10-20 (D-048)**; S1, S3–S5 and the independent review remain open. Depends on Part 05 (approved) and Part 06 (approved for S1–S5 scope).

## 1. Discovery
- The repository has **no authentication**: the only routes are the health endpoints (LOCALHOST.md §10 says so). Nothing exists to carry over, so "every existing user keeps their current access" has nothing to preserve in this codebase. Legacy-built marks in the spec cannot be verified here (Part 01 inventory: absent).
- Keywords searched (§4): login, session, role, permission, guard, policy, user_projects, approval limit. Only the Part 06 allocations (project scope) and the Part 05 settings matched.
- Session card: one slice per session and a plan first. This document is the plan. Slice S2 is the code.

## 2. Plan and phases
| Slice | Scope | Status |
|---|---|---|
| S1 | Authentication engine (Argon2id or scrypt, throttling, reset), OIDC/PKCE, MFA (TOTP, WebAuthn), sessions and devices | Not built. Needs an identity provider decision (CF-013) and session infrastructure; not started |
| S2 | Permission registry, roles, role grants (maker-checker), scoped assignments (maker-checker, own-scope check), policy decision `can()`, data scope, field masks, authority limits | **Built and APPROVED** (D-048); `src/iam/`, migration `202610191700`; 21 database tests, 12 pure |
| S3 | SoD rule engine, exceptions, detective scans | Not started |
| S4 | Privileged access, joiner/mover/leaver, access reviews, export controls | Not started |
| S5 | Zero-trust request pipeline, route registry (CP-IAM-05), shadow mode and switch-over | Not started. Routes need S1 authentication |

## 3. Decisions taken (assumptions)
- **Role grants carry no scope; assignments do.** A grant is a permission on a role. A person holds the role at a scope. A deny applies wherever the role is held. So "deny at one project" is a deny role assigned at that project (test: `iam.integration.test.ts`). This keeps the model small; a scope on the grant itself is possible later.
- **Deny by default, explicit deny wins, unknown permission and unknown condition fail closed.**
- **Grants count only when approved and in date.** Role grants and assignments need a second approver (CP-IAM-01). An assignment's assigner must hold `iam.assignment.create` over the scope they assign.
- **Conditions are limited to** `maxAmountPaise` and `statusIn`. Others are refused at proposal time.
- **Lists ignore conditional grants** (conservative): a list has no single record to test them against.
- **No cache yet.** `can()` reads the database each time. The p95 < 5 ms target needs a cache with event invalidation (Part 10); that is deferred.
- **Authority limits:** most specific applies (project and category), lowest within a level (conservative). Assumption A-14.
- **Field masks:** full removes the key, partial keeps the last four characters, hash gives the first 12 hex characters of SHA-256.

## 4. Requirements status (slice S2)
| Requirement | Status |
|---|---|
| REQ-IAM-F05 permission registry | Built: `registerPermissions`; key form `module.feature.action` |
| REQ-IAM-F06 roles and scoped assignments | Built, maker-checker; system roles from Annex B10 not seeded (A-13) |
| REQ-IAM-F07 policy decision point | Built: `can()`; explanation returned; no cache yet |
| REQ-IAM-F08 data-scope builder | Built: `dataScope()` returns ids and the all flag; repositories not yet wired |
| REQ-IAM-F09 field-level policies | Built: `maskFields()`; applied in serializers once routes exist |
| REQ-IAM-F10 authority limits | Built: `proposeLimit`, `approveLimit`, `mayApprove`; consumed by Part 16 |
| REQ-IAM-F11, F12, F13 | Not built (UI gating, explain/simulate, shadow mode): need routes or S5 |
| REQ-IAM-F01–F04, F14–F24 | Not built (slices S1, S3–S5) |

## 5. Verification (S2)
- `npx vitest run src/iam`: 33 tests (12 pure, 21 database). Covered: deny by default, unregistered permission refused, approval by a second person before a grant takes effect, explicit deny beating allow, scope containment, assigner's own scope, amount conditions, list scope, field masks, authority limits, tenant isolation.
- All eight gates pass; `src/iam` in the coverage scope (98.9 % lines).

## 6. Open items and risks
- **No authentication yet.** `can()` takes a `RequestContext` built by the caller. Nothing can yet prove who the caller is. Routes must not be exposed until S1 and S5.
- **Bootstrap:** the first administrator is written directly by the owner. A break-glass procedure belongs to S4.
- **Last-admin protection** (cannot remove the last Super Admin) is not enforced yet (S4).
- **Independent review** required (high risk, Part 00 §5.8).

## 7. Reporting format for each phase
1. Scope delivered (requirement IDs and files). 2. Verification (commands and counts). 3. Assumptions (IDs). 4. Not delivered (item and blocking input). 5. Decisions needed.
