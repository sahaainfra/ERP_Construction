# Part 08A discovery and plan

Module `auth`. Part 08A — Secure Login, Admin User Provisioning, Credentials & Session Lifecycle. Status: **discovery and plan only; no code written**. Part 08A depends on Parts 06, 07 and 08 (must be APPROVED). Parts 06 and 07 are approved. **Part 08 is not fully approved**: slice S1 is approved (D-056), slice S2 is built and awaiting approval (D-057). Under Part 00 §1.2 Part 08A cannot start as a build until Part 08 is approved.

## 1. Discovery (what exists)
- **Users:** there is no user table. The identity engine (Part 07, `src/iam/auth.ts`) keys credentials, sessions, devices and MFA factors by a free-text `user_ref`. Nothing defines a User ID, a person link, a user state or a validity window. The spec's "extend existing user tables" has nothing to extend; the table must be created (greenfield, A-01).
- **Sign-in:** the engine exists (scrypt, lockout, rotating refresh tokens, reset tokens, TOTP) but there is **no sign-in page, no login route, no reset route and no logout route**. `src/app` holds only the home page, the not-found page, the health routes and `api/` (health only).
- **Initial passwords:** `createCredentials` accepts a password supplied by the caller. Nothing generates, delivers or expires an initial credential, and nothing forces a change at first sign-in.
- **Account states:** none. Revocation (`iam_revocations`) is a flag, not a state machine. No suspension, expiry or dormancy.
- **Provisioning:** no admin console, no bulk import (Part 24 not built), no HR request queue (Part 54 not built).
- **Assignment wizard, My access, least-privilege shell:** the permission engine exists (`can()`, data scope, masks); nothing builds the menu or the wizard UI.
- **Platform administrator:** no separation exists. The bootstrap grants used by tests are written directly.
- **Delivery channels:** no email, SMS, WhatsApp or OTP delivery (Part 25 not built). Activation links and reset OTPs cannot be delivered yet.
- **Notifications, socket revocation, WorkChat device revocation:** not built (Parts 10, 25, 25C).

## 2. Gap against the spec
| Area | Spec | Found |
|---|---|---|
| User ID scheme and uniqueness | F01 | None |
| Admin create user (single, bulk) | F02, F03 | None (bulk needs Part 24) |
| Initial password / activation link | F04 | None; delivery needs Part 25 |
| HR joiner/leaver requests | F05 | None (needs Part 54) |
| Sign-in page and routes | F06 | None |
| First-login forced change and MFA enrolment | F07 | Engine has the pieces; no flow |
| Password policy (breach check, history, expiry) | F08 | Minimum length only; no breach list, no history |
| Argon2id with pepper | F09 | scrypt (A-17); no pepper, no vault |
| Change, forgot, admin reset | F10–F12 | Engine functions exist; no flows, no delivery |
| Lockout and throttling | F13 | Lockout exists; no progressive delay, no CAPTCHA, no IP limit |
| Assignment wizard and effective-access preview | F14 | None (engine exists) |
| Least-privilege shell | F15 | None |
| My access and profile | F16 | None |
| Account states and transitions | F17 | Only revocation flag |
| Sessions: idle, absolute, concurrency, cookies | F18 | Idle and absolute exist; no concurrency limit; no cookie flags (no web session yet) |
| Shared-device and kiosk | F19 | None |
| Login activity log | F20 | Exists (Part 08 S2) |
| Security alerts | F21 | Rules exist (Part 08 S2); no delivery |
| Platform-administrator separation | F22 | None |
| Break-glass | F23 | None (runbook and drill needed) |
| Session-to-socket revocation | F24 | None (Parts 10, 25) |

## 3. Blockers and decisions needed
1. **Part 08 approval.** Owner decides: approve S2 of Part 08, or approve Part 08A provisionally on the Part 08 S1 scope with the dependency recorded as a risk.
2. **Identity provider (CF-013)** still open; the sign-in engine runs on A-17/A-18.
3. **Delivery channels (Part 25)** are needed for activation links, reset OTPs and security alerts. Until they exist, the only delivery is a one-time display to the Administrator, which the spec allows only once and only under dual control.
4. **Part 54 (HR)** is needed for joiner and leaver requests; until then provisioning is Admin-initiated only.
5. **Part 24 (bulk import)** is needed for bulk provisioning.
6. **Password pepper** needs a vault decision (Part 08 S4, CF-012).
7. **Breached-password check:** an offline list or a k-anonymity range service must be chosen; an external service is a new processor under DPDP and needs a decision.

## 4. Proposed slices (unchanged from the spec)
| Slice | Scope | Blocked by |
|---|---|---|
| S1 User ID series, credential store, password policy, sign-in and logout, generic errors, throttling | Users table, series, policy, sign-in service and routes | Part 08 approval (decision 1) |
| S2 Admin provisioning (single and bulk), activation, first-login change, HR requests | Provisioning services; activation delivery | Part 25 for delivery (decision 3); Part 24 and Part 54 for bulk and HR |
| S3 Change, forgot and Admin reset; account states; dormant and expiry jobs | Flows; state machine; scheduler | Part 25 for OTP |
| S4 Assignment wizard, effective-access preview, least-privilege shell, My access | Wizard service; navigation generator | Part 12 for the UI |
| S5 Session management UI, kiosk mode, login activity log UI, security alerts | UI on existing services | Part 14 for kiosk, Part 18 for alerts |
| S6 Platform-administrator separation, super-user migration, break-glass | Role split; migration (ADR); runbook | Part 85 drill |

## 5. Assumptions I would take if the owner approves the plan
- A-29: the User ID pattern is `{COMPANY_CODE}{SEQ:5}` (for example `ACME00042`), configurable per company; a new series is started per company and never reused.
- A-30: activation and reset use single-use links, hashed at rest, delivered by Part 25 once it exists; until then no credential leaves the system except a one-time display under dual control.
- A-31: the existing scrypt parameters are kept (A-17) until Argon2id is approved; the pepper waits for the vault.
- A-32: a user row is a new `auth_users` table keyed by the User ID; existing `user_ref` values in Part 07 tables are treated as User IDs, so no re-keying is needed.

## 6. What I need from you
Decision 1 (Part 08 approval, or provisional approval of Part 08A). Decisions 3 to 7 can follow when the related slices start.
