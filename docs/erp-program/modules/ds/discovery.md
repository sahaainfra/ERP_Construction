# Part 12 — Enterprise design system, app shell and navigation: discovery, plan and execution prompt

Status: **discovery and plan only. No code.** Part 12 is not yet approved by the owner (Part 00 §1.2). Build of slice S1 waits for that approval. Risk is Medium, so an independent human reviewer is not mandatory under Part 00 §5.8, but the owner still approves the part and the design owner approves changes (CP-DS-03).

Dependencies (Part 00 §1.2): Part 05 (approved) and Part 07 (approved with conditions, D-054). Both are met.

## 1. Discovery summary

| Area | Present | Where | Gap against Part 12 |
|---|---|---|---|
| Token source | Token file v1.0.0 with themes `light`, `dark`, `high-contrast`, densities `compact`, `cozy`, `touch`, colour groups, typography, spacing, radius, elevation, breakpoints, layout, motion, z-index and contrast pairs | `design/design-tokens.json` | Source is cited as Annex A DS-4 to DS-9 and DS-13/14. The full Annex A is not in the repository (see §2.1) |
| Token build | Generator writes CSS custom properties | `scripts/build-tokens.mjs` → `src/design/tokens.css` (about 290 lines) | No TypeScript constants and no mobile resource output yet (REQ-DS-F01) |
| Contrast gate | Contrast check over the token pairs in light and high-contrast, run in `check-all` | `scripts/check-design.mjs` (passes after CF-004) | Runs on token pairs only; does not check tenant branding or runtime themes |
| Literal lint | None. ESLint is configured with the Next preset only | `eslint.config.mjs` | No rule blocks hex literals, raw pixel styles or icon imports by file (REQ-DS-F01, F05) |
| Shell | `AppShell` with context block (`aria-label="Current scope"`), side navigation with collapse toggle, `aria-current` on links, group headings | `src/components/shell/AppShell.tsx` | No shell bar, launcher, Create menu, inbox count, notifications, help or user menu. No rail, no bottom navigation. Context switcher not wired to Part 06 |
| Navigation registry | 13 groups and one entry (`/`) | `design/navigation-registry.json` | Almost empty. Each Part must register its routes (REQ-DS-F04) |
| Navigation filter | `visibleGroups()` shows an entry only when its route is in `LIVE_ROUTES` (currently `/`) and treats every entry as permitted when `permission` is null | `src/design/navigation.ts` | The permission check is a placeholder. Part 07 is built and provides `can()`, so the filter must use it now (A-76) |
| Icons | Semantic keys mapped to `lucide-react` icons (single family, ADOPT on TECH_RADAR) | `src/design/icons.tsx` | No construction glyphs (BOQ, MB, DPR, pour card, crane, rebar and so on). No rule against importing icons by file |
| Fonts | IBM Plex Sans and Plex Mono loaded through `next/font/google` in the root layout | `src/app/layout.tsx` | Loaded from Google at build time, not self-hosted (REQ-DS-F02, A-74). No Devanagari or regional script font |
| Preferences | A preferences helper for shell state (navigation collapsed and similar) | `src/design/preferences.ts` | Not persisted per user; no `ui_user_preferences` table (REQ-DS-F10) |
| Status chip | One component | `src/design/StatusChip.tsx` | Other shared components are missing (§4 S3 and S4) |
| Branding | None | — | Full gap (REQ-DS-F11). Needs storage for the logo (CF-027) |
| Templates and states | None beyond the shell | — | Full gap (REQ-DS-F06). Part 08A's sign-in screens need these templates |
| Component library | None beyond the shell, status chip and icons | — | Full gap (REQ-DS-F07, F08). Grid, form, chart and map libraries need ADRs (§2.3 to §2.5) |
| Style guide and preview | None | — | Full gap (REQ-DS-F13, F15). Hosting of the preview is open (CF-012) |
| Quality gates | `check-all` runs contrast only. `docs/erp-program/quality-gates.json` lists mandatory gates (lint, arch, typecheck, unit, contract, database, golden baseline, migration lint, secret scan, build, e2e smoke, accessibility, performance smoke) of which the build, e2e, accessibility and performance gates are not in `check-all` | `docs/erp-program/quality-gates.json`, `scripts/check-all.mjs` | Design gates (CP-DS-02) need token, icon and navigation lint, axe, and visual regression. Playwright 1.55 and `@axe-core/playwright` are already dependencies, so no new package is needed for these |
| Route isolation | Route registry checks every route file has a permission or a public reason | `src/iam/routes.ts`, `scripts/iam/route-check.ts` | `/_tech` does not exist yet. Its isolation (REQ-DS-F13, acceptance §16) can reuse the same check |
| Front-end architecture | ADR-007 accepted. The state library `@tanstack/react-query` is on TRIAL pending the ADR | `docs/erp-program/adr/ADR-007.md`, `TECH_RADAR.md` | Server-state conventions for lists and grids depend on this decision |

Open conflicts that touch this part: **CF-004** is resolved (contrast colours). **CF-012** (cloud region) decides where the preview environment and logo storage run. **CF-027** (object storage) decides where tenant logos are kept. **CF-022** (branch protection and code owners) affects the design owner's approval of changes (CP-DS-03).

## 2. Decisions needed from the owner (minimum)

1. **Annex A.** The design rules DS-1 to DS-35 are the basis of this part, but Annex A is not in `docs/erp-program/annexes/` (only Annexes C, D and E are). Commit Annex A to the repository, or confirm that the rules in Part 12 and `design-tokens.json` are the working copy. Until then the DS numbers are cited, not verified.
2. **Fonts.** Options: (a) self-host IBM Plex and Noto under their OFL licences in `public/fonts` (**recommended**: no build-time call to a third party, and REQ-DS-F02 requires self-hosting); (b) keep `next/font/google`, which needs a build-time network call to Google and is not self-hosted.
3. **Grid library.** Options: (a) TanStack Table and TanStack Virtual, both MIT, headless, with our own grid chrome (**recommended**: one headless engine, matches ADR-007's direction); (b) AG Grid Community (MIT) with its own styling; (c) a commercial grid (not recommended without a licence review). Requires an ADR.
4. **Form library.** Options: react-hook-form (MIT) with zod (MIT, which TECH_RADAR lists as ASSESS and needs its own ADR) for schemas (**recommended**), or a hand-written form kit. Requires an ADR.
5. **Chart library.** Annex A DS-11 limits charts to allowed forms (S-curve, Gantt, waterfall, bullet, heatmap). Options: (a) Apache ECharts (Apache-2.0) covers all forms (**recommended**); (b) Recharts (MIT), which does not cover Gantt or heatmap natively. Requires an ADR (TECH_RADAR HOLD).
6. **Design and product owners.** CP-DS-03 needs a named design owner and product owner for approving major changes. The owner names the people or confirms the role codes.
7. **Preview environment.** The hosting region and domain for `preview.<domain>` (CF-012). Until they are set, the preview is built and tested locally only.
8. **Logo storage.** Where tenant logos are kept (CF-027). Until chosen, branding accepts an uploaded logo only as a file held in the existing storage adapter.
9. **Persona list.** Confirm the preview persona list in REQ-DS-F15 (fifteen roles), or change it. Preview fixtures are synthetic and labelled; no real person's data is used.
10. **WorkChat launcher.** REQ-DS-F16 belongs to Parts 25 and 25A, which are not approved. Plan: a placeholder slot behind a feature flag, off until those Parts are approved (A-82).

## 3. Assumptions proposed for Part 12

Proposals, recorded in `ASSUMPTIONS.md` only when the owner approves Part 12.

- **A-72 Tokens.** `design/design-tokens.json` remains the single source. The build generates CSS custom properties, TypeScript constants and mobile resources from it. Literals are blocked outside the token package.
- **A-73 Themes.** Theme and density are set by a `data-theme` and `data-density` attribute on the root element. The OS colour preference is honoured until the user chooses. The user's choice is stored in `ui_user_preferences`.
- **A-74 Fonts.** IBM Plex Sans and Plex Mono and Noto Sans Devanagari are self-hosted under OFL (pending §2.2). Font files are not packages, so no ADR is needed for them.
- **A-75 Icons.** `lucide-react` stays the single outline family (TECH_RADAR ADOPT). Construction glyphs are original SVGs in `src/design/glyphs/`, keyed semantically. An icon is imported only through the registry.
- **A-76 Navigation.** Each navigation entry names its route and its permission key. The filter calls Part 07 `can()` for each entry. An entry shows only when its route is implemented (the live-route list stays as the second check).
- **A-77 Branding.** A tenant's brand colours are checked server-side with the same contrast rule as `scripts/check-design.mjs`. A change that fails the check is refused. Status colours are never brandable.
- **A-78 Preferences.** Preferences are stored per user. Role defaults are added with Part 16 and Part 13.
- **A-79 Visual regression.** Visual checks use Playwright's built-in snapshot comparison, which is already a dependency. No new package is added for S5.
- **A-80 Preview.** Preview fixtures live in `src/preview/`, are labelled "PREVIEW DATA", and are excluded from the production build by a build-time guard. CP-DS-04 is checked by a bundle scan.
- **A-81 Style guide.** The style guide is at `/_tech/design-system`, behind a Technical Console permission (`ds.styleguide.view`). It is never in navigation for business roles.
- **A-82 WorkChat slot.** The launcher slot is a placeholder behind `ff.ds.workchat`, off until Parts 25 and 25A are approved.

## 4. Execution phases, deliverables and gates

Each phase is one session (Part 00 §12, Annex E1). A phase starts only when the previous phase's gates are green and the owner has approved the phase where Part 00 requires it.

**Phase 0 — Discovery and plan (this session).** Deliverables: this document; PROGRESS_REGISTER status for `ds`. Gate: none (no code). Stop and report.

**Phase 1 — S1 Tokens, typography, themes, branding.** Deliverables:
- Token build extended to TypeScript constants and mobile resources; literal lint (hex, raw pixel style) in module code (REQ-DS-F01, A-72).
- Runtime theme and density switching with the OS preference honoured (A-73).
- Self-hosted fonts and Devanagari support (REQ-DS-F02, A-74, pending §2.2).
- Tenant branding: `ui_branding` table (additive, RLS), contrast recheck with refusal on failure (REQ-DS-F11, A-77), maker-checker on change (`ui.branding.changed` event through the outbox).
- Tests: contrast refusal for a failing brand colour; status colours refused as brand input; literal lint fails on a planted hex value.

Gates: `npm run check:all` 9 of 9; the literal lint and branding tests; contrast check passes in all three themes.

**Phase 2 — S2 Shell, navigation, icons, preferences.** Deliverables: shell bar (launcher, logo, context switcher from Part 06 scope, Create menu for permitted quick-creates, inbox and notification placeholders, help, user menu); side navigation with Pinned and Recent; rail on tablet; bottom navigation on mobile (Today · Inbox · Capture · Tasks · More); navigation filtered by `can()` (A-76); icon registry with the import lint; `ui_user_preferences` and `GET/PUT /api/v1/ui/preferences` (REQ-DS-F10, A-78).

Gates: check:all; a business role cannot see or open `/_tech`; a navigation entry the user lacks permission for is absent from the DOM; icon import by file fails the build.

**Phase 3 — S3 Templates and core components.** Deliverables: page templates Launchpad, List Report, Object Page (tabs per REQ-DS-F09: Details, Lines, Attachments, Approvals, Accountability, Timeline, Discussion, Related), Worklist, Overview, Wizard, Settings, Mobile Capture; public templates for sign-in, MFA, set and reset password, session expired and access denied (REQ-DS-F06), which Part 08A builds on; all required states (loading skeleton, empty with next action, validation summary, permission with "who to ask", error with correlation id, offline, sync conflict, integration failure, job failure); core components (Tabs, Drawer, Modal, Toast, Banner, EmptyState, ErrorState, Skeleton, FilterBar, Stepper, ApprovalPanel, AttachmentPanel, AuditTimeline).

Gates: check:all; accessibility check (axe) on each template in each theme; every template renders each state.

**Phase 4 — S4 Grid, form kit, protocol and construction components.** Deliverables: DataTable on the approved grid library (§2.3): server-side paging, sorting and filtering, column chooser, pinning, grouping, totals, tree grid for WBS, BOQ and CBS, inline edit with row validation, saved variants, bulk actions, virtual scroll, keyboard navigation and paste for permitted grids; form kit on the approved form library (sections, units beside quantities and amounts, value-help dialogs, Item Selector slot for Part 23, autosave draft, dirty guard, error summary); charts in the allowed forms on the approved chart library (§2.5); protocol components (GateStatusPanel, ExceptionRequestDialog, ReasonCodePicker, EmergencyBanner, ComplianceScoreBadge, PlannedVsActualBar, ValueAtRiskChip, DataLabel, Why?) (REQ-DS-F08, CP-DS-01); construction glyphs (A-75); comparison view; map container (provider-agnostic); signature pad; camera, QR and GPS capture controls.

Gates: check:all; the 50,000-row grid test at 60 fps on the reference laptop profile (acceptance §14, measured as a performance check); protocol components pass axe in each theme.

**Phase 5 — S5 Style guide, gates, theme bridge, preview environment.** Deliverables: living style guide at `/_tech/design-system` (A-81); design quality gates added to the pipeline: token, icon and navigation lint, contrast, axe and visual regression (CP-DS-02, A-79); theme bridge for legacy screens behind `ff.ds.theme`, with visual baselines and `THEME_ADOPTION.md`; preview environment with persona switcher, role spaces, Project 360, site mobile home and control towers on labelled synthetic data using the widget contract (A-80); bundle scan proving no preview code in production (CP-DS-04).

Gates: check:all; visual regression shows only approved token changes; the bundle scan finds no preview code; `/_tech` is unreachable for business roles.

**Final gate for Part 12 (before the owner approves the part).** Acceptance criteria in §16 each with evidence; design owner sign-off on the change record for the initial token set (CP-DS-03).

## 5. Reporting format (required for every phase)

Each session closes with this report, in this order. Missing items mean the phase is not complete.

1. **Phase and slice:** for example `Part 12 · S1`.
2. **Outcome:** one line, stated plainly: built, partly built, blocked, or planned only.
3. **Deliverables:** a list, each with the file or route path and the requirement id (REQ-DS-Fxx or CP-DS-xx).
4. **Assumptions and decisions:** the new assumption ids (A-72 onward) and decision ids (D-xxx). Nothing is recorded as approved unless the owner approved it.
5. **Evidence:** the exact command and its result for each gate: `npm run check:all` (x of 9 passed), the named tests, the contrast report, and any axe or visual-regression results with the number of checks run.
6. **Visual changes:** every change to a rendered screen, listed as an approved token change or as a defect.
7. **Not built and why:** each item from the phase plan that is not done, with the reason.
8. **Owner items:** each question that needs the owner, with the minimum information needed to answer it.
9. **Next step:** the next phase, and whether it needs approval first.

Documentation updated in the same session: `ASSUMPTIONS.md`, `DECISIONS.md` (only for owner-approved items), `CHANGELOG.md`, `DB_EXTENSIONS.md` (for each migration), `modules/ds/traceability.csv`, `PROGRESS_REGISTER.csv` (via `npm run adopt:program`), and `THEME_ADOPTION.md` from S5.

## 6. Enhanced execution prompt for Part 12

Use this with Annex E1 at the start of each Part 12 session. The universal requirements U1–U20 (Part 00 §12.2) apply without being restated.

> You are a senior front-end developer and design-system engineer working on the ERP in `/home/user/ERP_Construction`, branch `claude/bold-allen-rj3t08`.
>
> 1. Read `modules/ds/discovery.md`, Part 12 and the Part 00 sections it cites. Inspect `design/design-tokens.json`, `scripts/build-tokens.mjs`, `scripts/check-design.mjs`, `src/components/shell/AppShell.tsx`, `src/design/navigation.ts` and `src/app/layout.tsx` before you change anything.
> 2. Work on one slice only. Phase 0 produces a discovery summary and plan and no code.
> 3. No module-local colours, fonts, shadows, icons, page frames or menus (N24). A needed variant is a request to the design owner, not a local style.
> 4. Do not add a package without an ADR (CP-ARCH-01). Grid, form, chart and schema libraries each need their ADR before the slice that uses them.
> 5. Every screen change is either an approved token change or a defect. Record the visual diff for each.
> 6. Record every assumption with an id from A-72 onward. Record an owner decision only when the owner has given it in their own words.
> 7. Preview fixtures never enter the production build. Fixtures are labelled PREVIEW DATA.
> 8. Preserve working behaviour. Additive, backward-compatible changes only. Any migration ships with a down script, a DB_EXTENSIONS row and an entry in the migration list test.
> 9. Stop and report when a change is destructive, replaces existing code, or conflicts with a documented decision.
> 10. Run `npm run check:all` with the database running and `.env.test` loaded. Do not commit on a failing run.
> 11. Close the session with the reporting format in §5 of this document.
