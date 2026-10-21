# Part 08 discovery and plan

Module `secgov`. Part 08 — Audit Trail, Secure SDLC & Security Governance. Status: **discovery and plan (first session); slice S1 built (D-055), approval pending the owner**. Dependencies Parts 04, 05 and 07 are approved (Part 07 under D-054).

## 1. Discovery (what exists)
- **Audit:** an interim audit table `core_audit_entries` (Part 05, append-only, RLS) is written by the unit of work. It has no hash chain, no before/after values, no reason framework and no sensitive-read logging. Part 08 replaces it behind the same interface (D-034).
- **Audit in other modules:** `org` and `iam` write through the same unit of work. Their audit `detail` holds only ids and short facts.
- **Security events:** none. The pipeline and login refusals return errors but do not store events.
- **CI security:** secret scan is a blocking gate (`npm run secret:scan`, Part 04). `security-audit` (production dependency advisories) and the design contrast gate are non-blocking (`continue-on-error`, CF-014, R-02). No SAST, DAST, container, IaC, licence or SBOM blocking gate beyond the SBOM job.
- **Secrets:** `.env.local` and `.env.test` are git-ignored; `.env.example` placeholders are committed; the secret scan reviews them.
- **Privacy:** none. No personal-data inventory or request workflow exists.
- **Open-source register and dependency approval:** none beyond `DEPENDENCY_ALLOWLIST.json` (Part 02) and ADR references.

## 2. Gap against the spec
| Area | Spec | Found |
|---|---|---|
| Audit writer, hash chain, anchors | REQ-SECGOV-F01/F02 | Interim writer only; no chain |
| Explorer and timeline | F03 | None |
| Reason framework | F04 | None |
| Sensitive reads | F05 | None |
| Login and security events | F06 | None |
| Secure SDLC, CI security slot | F08, F09 | Secret scan only; others non-blocking or absent |
| Dependency and OSS governance | F10, F17 | Allow-list only |
| Risk acceptance | F11 | None (CP-SECGOV-04 cannot be enforced yet) |
| Secrets vault | F12 | Not configured; no vault decision (CF-012 open) |
| Web and mobile baselines | F13, F15 | Not applied in the app (no CSP, HSTS or CORS configured) |
| Privacy (DPDP) | F18–F20 | None |

## 3. Blockers and decisions needed (as at the plan; S1 built since)
1. **Part 07 approval** is held. Part 08 needs it. Owner options: (a) approve Part 08 provisionally on Part 07's approved scope, recording the held items as a dependency risk; or (b) wait until the Part 07 review items are closed and the human reviewer has checked them.
2. **Vault (F12)** needs a provider decision (CF-012).
3. **Chain anchoring to WORM storage (F02)** needs a provider decision (CF-012).
4. **DPDP** needs a named Data Protection Officer (role in §3 of the spec) and legal review of the notice and consent texts. Not assumable.
5. **Risk-acceptance approvers** are roles (CISO, Management). Names are needed before the approval chain can work.

## 4. Proposed slices (unchanged from the spec)
| Slice | Scope | Blocked by |
|---|---|---|
| S1 Audit writer, chain, explorer, timeline, reasons | Replace the interim adapter behind the unit-of-work interface; hash chain per day; verification job; explorer and timeline; reason catalogue; legacy adapter | Part 07 approval (decision 1) |
| S2 Security events and console | Login history, event store, console states | S1 |
| S3 Secure SDLC, CI slot, dependency, OSS and risk governance | Blocking gates by policy table; risk-acceptance expiry enforced in CI | S1; CF-014 (which gates block) |
| S4 Secrets, web and mobile baselines, legacy scan | CSP, HSTS, CORS, cookie flags, SSRF-safe client; scan findings lifecycle | Provider decision (decision 2) for vault |
| S5 Privacy governance | Inventory, requests, breach runbook | DPO named (decision 4) |

## 5. Assumptions I would take if the owner approves the plan
- A-23: the audit chain is per tenant per day, verified nightly, with the head hash written to the audit anchor table. External WORM anchoring waits for a provider.
- A-24: the CI blocking policy starts with secret scan, SAST (CodeQL or Semgrep, both open source) and dependency advisories at high and critical. Container and IaC scans follow once an image is produced.
- A-25: CSP starts report-only and moves to enforce after one clean release.

## 6. What I need from you
Decision 1 (approve Part 08 on the held Part 07 scope, or wait). Decisions 2–5 can follow when their slice starts.
