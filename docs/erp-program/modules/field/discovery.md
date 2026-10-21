# Part 14 — Responsive field app and offline-first engine: discovery, plan and execution prompt

Status: **discovery and plan only. No code.** Part 14 is not yet approved by the owner (Part 00 §1.2). Build of slice S1 waits for that approval. Risk is High, so an **independent human reviewer is mandatory** (Part 00 §5.8). Agent reviews do not satisfy this.

Dependencies (Part 00 §1.2): Part 07 (approved with conditions, D-054), Part 10 (approved, D-063; S1 built), Part 12 (approved for S1 to S3, D-072; S4 and S5 open). All three are met for S1 to S3. Part 14 S2 onward needs the session layer (§2.1), which Part 08A has not built.

## 1. Discovery summary

| Area | Present | Where | Gap against Part 14 |
|---|---|---|---|
| Architecture decision | ADR-008 (accepted, D-038): a PWA on the same Next.js application first, with a service worker, an encrypted IndexedDB store and a command queue; React Native only if a device capability cannot be met, with evidence | `docs/erp-program/adr/ADR-008.md` | Decision made. Native packaging is out of v1 unless evidence is recorded (A-113) |
| Web app manifest | None. No `manifest` route or icons | `src/app` | Full gap (REQ-FIELD-F05) |
| Service worker | None. No `public/sw.js`, no registration code | — | Full gap (REQ-FIELD-F01, F07) |
| Offline store | None. No IndexedDB, no key derivation | — | Full gap (REQ-FIELD-F07) |
| Command queue, sync, conflicts | None | — | Full gap (REQ-FIELD-F08, F11, F12) |
| Device identity | Sessions carry a device fingerprint; the sign-in path records it | `src/iam/auth.ts` (`deviceFingerprint`), `iam_sessions` | No device registry, no binding, no wipe (REQ-FIELD-F15) |
| Session for a device | Token verification and refresh exist as library functions | `src/iam/auth.ts` (`verifyAccess`, `refreshSession`) | **No HTTP session layer.** Field sign-in, kiosk login and every sync endpoint need it (§2.1) |
| Permissions and scope | `can()`, allocations, data-scope predicates | `src/iam/pdp.ts`, `src/org/allocations.ts` | Reusable for snapshot scope |
| Event bus | Outbox, inbox, broker (Part 10 S1) | `src/evbus/*` | Field events publish through it (REQ-FIELD-F09 events) |
| Design and shell | Mobile bottom bar fed by live entries; 360 px rules; sunlight-capable high-contrast theme; touch density; states and templates | `src/components/shell/AppShell.tsx`, `src/design/*`, `src/design/ui/*` | Reusable. Field shell variants, steppers and capture components are not built (REQ-FIELD-F01 to F03) |
| Capture hardware | None. No camera, geolocation, barcode, signature, voice or NFC code | — | Full gap (REQ-FIELD-F03). Browser APIs only, no packages (A-118) |
| Media | None. Media storage is not provisioned (CF-027) | — | Full gap (REQ-FIELD-F10); protocol built against a test adapter |
| Push | None. Push depends on Part 10 S5 and Part 25 channels | — | Deferred within Part 14 (§2.4) |
| WorkChat offline outbox | Not built. Part 25 not approved | — | Deferred (REQ-FIELD-F18) |
| Offline tests | Playwright is configured and offline emulation is available in Chromium (`context.setOffline`) | `playwright.config.ts`, `e2e/` | Usable for the offline scenarios of §16 |
| Signing for controlled offline actions | None | — | Needed for signed WA and permit snapshots (REQ-FIELD-F09). Key custody is an owner decision (§2.2) |
| Conflicts with money and approvals | Approval records and maker-checker exist in IAM and modules | `src/iam/roles.ts`, `src/org/*` | The conflict rules for finance and approvals wait for their owning Parts |

Open conflicts that touch this part: **CF-027** (object storage: media), **CF-012** (cloud region: push and media hosting), **CF-013** (identity provider: device sign-in), **CF-008** (upgrades go through an ADR: any new library for offline storage, decoding or push needs one).

## 2. Decisions needed from the owner (minimum)

1. **Session layer first (critical).** Field sign-in from a device, kiosk PIN login, auto-logout and every sync endpoint need an HTTP session that resolves tenant and user from the request. Options: (a) build the session layer as the first slice of Part 14 (**recommended**; it is the same gap blocking Part 08A S2 onward, Part 12 screens and Part 13 screens, so it should be built once, under Part 08A); (b) Part 14 S1 builds the shell, capture components and offline store with no sign-in, and S2 onward waits. **Recommended: (a), scheduled under Part 08A.**
2. **Signing key for controlled offline actions.** A WA or permit snapshot must be verified on the device. Options: (a) Ed25519 signatures, with the public key on the device verified through the browser's WebCrypto (**recommended**: no secret on the device; supported in current Chromium and Safari; devices without support refuse controlled offline actions and say so); (b) HMAC with a secret the device cannot hold, which would force every controlled check online (rejected). The owner confirms (a) and names who holds the signing key.
3. **Media storage.** The media pipeline needs object storage (CF-027). Until chosen, S4 builds the chunked, resumable protocol and hash verification against a test adapter, with no production upload.
4. **Push.** Web Push needs the VAPID-signed push protocol on the server. Options: (a) defer push to Part 25 channels (**recommended**); (b) adopt a Web Push library under an ADR. Owner decides.
5. **Barcode decoding.** Options: (a) the browser's barcode detector where it exists, with manual entry as the fallback on other browsers (**recommended**: no package); (b) a decoder library under an ADR for full coverage.
6. **Snapshot ages and online-only actions.** The owner confirms the soft age (default 24 hours), the hard age per controlled action (for example issue against a WA and attendance), and the online-only list in REQ-FIELD-F16 (approvals with financial impact, payments, PO release, stock posting confirmation, master-data and permission changes).
7. **Emergency regularisation.** CP-FIELD-04 needs the regularisation time limit, which the owner sets (Part 17 supplies the emergency path).
8. **Field roles and their five bottom-bar items** (REQ-FIELD-F01). The owner confirms the list per role.
9. **Offline session window and device policy.** The maximum offline session (default 72 hours, as in §10.3) and whether an MDM is in use (REQ-FIELD-F05).
10. **Independent human reviewer** for Part 14 (Part 00 §5.8). The owner names the person.

## 3. Assumptions proposed for Part 14

Proposals, recorded in `ASSUMPTIONS.md` only when the owner approves Part 14.

- **A-113 Packaging.** A PWA on the existing application (ADR-008). Native packaging is not built; it is reconsidered only with recorded device evidence.
- **A-114 Service worker.** Hand-written and minimal, in `public/`, with an explicit cache list and no third-party runtime. A library such as Workbox or Serwist needs an ADR (CP-ARCH-01) and is not added in S1.
- **A-115 Offline store.** A small typed wrapper over IndexedDB written in the repository. No storage library is added (localforage and Dexie need an ADR).
- **A-116 Encryption at rest.** A non-extractable AES-GCM key is created in WebCrypto on the device and stored with the database; every record is encrypted with it. The key is wrapped with a key derived from the signed-in session on each unlock, so a stolen device without the session cannot read the store. Logout, revocation or wipe deletes the key, which makes the data unreadable at once.
- **A-117 Scoped snapshot.** The snapshot holds only what the user may see, derived from allocations and permissions on the server, with a version and a generated-at time. Delta refresh with a 500 MB budget. Freshness shows as a warning after the soft age and blocks controlled actions after the hard age (REQ-FIELD-F14).
- **A-118 Capture.** Browser APIs only: camera capture, geolocation with accuracy shown, barcode detection with a manual fallback, canvas signature, Web Speech for voice where present (its absence is shown, not hidden), and Web NFC only where present. No capture package is added.
- **A-119 Command envelope.** Each command carries a UUID, its type, payload, base record versions, device time, the server receipt time (set by the server), GPS when permitted, and the correlation id (CP-FIELD-02). The server processes each command idempotently by its UUID.
- **A-120 Conflicts.** The server is authoritative. A conflict in money, approval or stock is never resolved by the system: it goes to a person with the server and local versions side by side, and "keep mine" on a locked record creates an amendment request, not an overwrite (REQ-FIELD-F12).
- **A-121 Device binding.** A device is registered on first sign-in and bound to its user and to its session. A wiped or revoked device is refused at its next contact, and its queued commands are reported as rejected (REQ-FIELD-F15).
- **A-122 Kiosk mode.** A kiosk login uses a PIN and the device binding, ends the session after a configurable idle time, and shows no cached data from another user (REQ-FIELD-F06).

## 4. Execution phases, deliverables and gates

Each phase is one session (Part 00 §12, Annex E1). A phase starts only when the previous phase's gates are green and the owner has approved the phase where Part 00 requires it.

**Phase 0 — Discovery and plan (this session).** Deliverables: this document; PROGRESS_REGISTER status for `field`. Gate: none (no code). Stop and report.

**Phase 1 — S1 Shell variants, responsive patterns, capture components.** Deliverables: mobile bottom bar with five configurable items and More, tablet rail with master–detail, desktop navigation, orientation-safe state (REQ-FIELD-F01); card-list transformation of grids, sticky filter chips, stepper with progress and sticky primary action, numeric keypad for quantities and unit beside value, touch targets of at least 44 px (REQ-FIELD-F02); capture components for camera (compression profiles, annotation, watermark), geolocation with accuracy, barcode detection with manual fallback, signature pad, voice input (where present), file picker and NFC (where present) (REQ-FIELD-F03, A-118). Components use the Part 12 tokens only.

Gates: `npm run check:all` 9 of 9; the literal and icon rules (Part 12) pass; accessibility cases for each variant at 360 × 800 and 820 × 1180 in all three themes, including the sunlight (high-contrast) theme (CP-FIELD-06).

**Phase 2 — S2 PWA packaging, push and kiosk mode, field home.** Deliverables: web app manifest and icons; install prompt; update banner; minimum-version policy (REQ-FIELD-F05); service worker with the explicit cache list (A-114); deep links verified; kiosk login with PIN, device binding, idle logout and no cross-user cache (REQ-FIELD-F06, A-122); field home "Today" per role showing gates, tasks, DPR status, attendance and approvals, with offline-capable actions marked and the emergency button (REQ-FIELD-F04). Push is deferred (§2.4). **Requires the session layer (§2.1).**

Gates: check:all; the manifest and service worker register in a Chromium run; a kiosk session from user A does not expose user A's data to user B after logout; the emergency button is present at 360 px.

**Phase 3 — S3 Encrypted store, snapshot and delta, command queue.** Deliverables: encrypted IndexedDB store with the key lifecycle of A-116; scoped snapshot endpoint and delta refresh with the size budget and freshness metadata (REQ-FIELD-F07, A-117); command queue with UUID, base versions, device time, receipt time and correlation id (REQ-FIELD-F08, A-119); offline validation sharing the server's rule package where the rules are pure (REQ-FIELD-F09); signed authorisation snapshots with Ed25519 verification on the device (§2.2).

Gates: check:all; a unit test that removing the key makes the store unreadable; a snapshot never contains a record outside the viewer's scope (the same access matrix as Part 13 S3); a command with a stale base version is rejected server-side, not applied.

**Phase 4 — S4 Sync engine, media pipeline, conflicts, status centre.** Deliverables: background sync with exponential backoff, partial batches with per-item results, bandwidth and sync-window awareness, 72-hour tolerance (REQ-FIELD-F11); chunked resumable media upload with hash verification, Wi-Fi-only option and priority ordering, against the test adapter until storage is chosen (REQ-FIELD-F10, §2.3); conflict framework with rule registration per entity and the human resolution screen (REQ-FIELD-F12, A-120); status model Offline, Queued, Syncing, Synced, Conflict, Failed on each record and globally, with the sync status centre (REQ-FIELD-F13); events `field.command.accepted|rejected`, `field.conflict.raised|resolved` through the outbox.

Gates: check:all; Playwright offline scenario: a DPR and a punch captured offline for 72 hours (time simulated by the test clock) sync once, in order, with correct statuses; a conflict on an approved DPR shows the conflict screen and "keep mine" creates an amendment request; a failing batch item does not block the others.

**Phase 5 — S5 Device binding and wipe, capability registry, diagnostics.** Deliverables: device registry (`off_devices`, or the Part 07 device record where it fits), binding on first sign-in, remote wipe with rejection and reporting of queued commands from a revoked device (REQ-FIELD-F15, A-121); offline-capability registry per module and command type with the online-only list enforced (REQ-FIELD-F16); redacted sync log export with correlation ids and consent-based upload (REQ-FIELD-F17); stale-queue and repeated-rejection telemetry (CP-FIELD-05); reports for sync health and stale devices (Part 14 §11).

Gates: check:all; a revoked device's queued command is rejected and reported; an online-only command is refused when submitted offline; diagnostics contain no personal data (redaction test with the Part 09 rules).

**Deferred and out of this build:** WorkChat offline outbox and low-bandwidth chat (REQ-FIELD-F18, Parts 25 and 25A); push delivery (§2.4); business screens of DPR, attendance, inspections and issues, which their owning Parts register with this engine; native packaging (A-113); on-device AI photo hints (no AI decisions in v1).

**Final gate for Part 14 (before the owner approves the part).** Acceptance criteria in §16 each with evidence, including the 72-hour scenario, the revoked-device scenario, the conflict scenario, the snapshot hard-age block and the 360 × 800 sunlight-mode check; the independent human reviewer's report; every finding fixed or accepted by the owner.

## 5. Reporting format (required for every phase)

Each session closes with this report, in this order. Missing items mean the phase is not complete.

1. **Phase and slice:** for example `Part 14 · S1`.
2. **Outcome:** one line, stated plainly: built, partly built, blocked, or planned only.
3. **Deliverables:** a list, each with the file or route path and the requirement id (REQ-FIELD-Fxx or CP-FIELD-xx).
4. **Assumptions and decisions:** the new assumption ids (A-113 onward) and decision ids (D-xxx). Nothing is recorded as approved unless the owner approved it.
5. **Evidence:** the exact command and its result for each gate: `npm run check:all` (x of 9 passed), the named tests, the Playwright offline results, the accessibility results at each width and theme, and the device capability matrix for the browsers tested.
6. **Device and browser coverage:** each browser and platform used in testing, and what it could not do (for example Web Speech or Web NFC absent).
7. **Not built and why:** each item from the phase plan that is not done, with the reason.
8. **Owner items:** each question that needs the owner, with the minimum information needed to answer it.
9. **Next step:** the next phase, and whether it needs approval first.

Documentation updated in the same session: `ASSUMPTIONS.md`, `DECISIONS.md` (only for owner-approved items), `CHANGELOG.md`, `DB_EXTENSIONS.md` (for each migration), `modules/field/traceability.csv`, `PROGRESS_REGISTER.csv` (via `npm run adopt:program`).

## 6. Enhanced execution prompt for Part 14

Use this with Annex E1 at the start of each Part 14 session. The universal requirements U1–U20 (Part 00 §12.2) apply without being restated.

> You are a senior full-stack developer and mobile-web engineer working on the ERP in `/home/user/ERP_Construction`, branch `claude/bold-allen-rj3t08`.
>
> 1. Read `modules/field/discovery.md`, Part 14, ADR-008 and the Part 00 sections it cites. Inspect `src/iam/auth.ts`, `src/iam/pdp.ts`, `src/design/ui/`, `src/components/shell/AppShell.tsx`, `src/evbus/` and `playwright.config.ts` before you change anything.
> 2. Work on one slice only. Phase 0 produces a discovery summary and plan and no code.
> 3. No package is added without an ADR (CP-ARCH-01). Service worker, offline store, capture and signing use the browser's own APIs unless an ADR says otherwise.
> 4. Offline records are PROVISIONAL until the server accepts them. The server re-evaluates every controlled action at sync, and its answer governs.
> 5. Money, approval and stock conflicts are never resolved by the system. A person resolves them, with both versions shown.
> 6. Never store a session key, a signing key or personal data in plain text on the device. A wiped or revoked device stops working at its next contact.
> 7. Every field-critical action is tested at 360 × 800 in the sunlight (high-contrast) theme.
> 8. Record every assumption with an id from A-113 onward. Record an owner decision only when the owner has given it in their own words.
> 9. Preserve working behaviour. Additive, backward-compatible changes only. Any migration ships with a down script, a DB_EXTENSIONS row and an entry in the migration list test.
> 10. Stop and report when a change is destructive, replaces existing code, or conflicts with a documented decision, including when a screen or sync endpoint needs the session layer that does not yet exist.
> 11. Run `npm run check:all` with the database running and `.env.test` loaded. Do not commit on a failing run; stage first so the secret scan sees the same files.
> 12. Close the session with the reporting format in §5 of this document.
