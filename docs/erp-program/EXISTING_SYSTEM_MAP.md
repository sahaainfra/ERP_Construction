# EXISTING_SYSTEM_MAP

Part 01, REQ-DISC-F02. Read-only inventory of repository `sahaainfra/ERP_Construction`, branch `claude/bold-allen-rj3t08`, at the commit recorded in `modules/disc/inventory.json` (field `head`). Regenerate with `node scripts/erp-program/inventory.mjs`.

**Finding that governs everything below:** the repository holds a new Next.js application and the Part 00 reference set. It holds no legacy business system (CF-001). Most categories are therefore empty, and each empty category is recorded as an empty search, not omitted.

## Stack and versions
| Layer | Technology | Version (installed) | Licence | Status |
|---|---|---|---|---|
| Frontend framework | Next.js (App Router) | 15.5.28 | MIT | In use; see advisories |
| UI library | React / react-dom | 19.1.0 | MIT | In use |
| Icons | lucide-react | 1.59.0 | ISC | In use |
| Language | TypeScript | 5.9.3 | Apache-2.0 | In use |
| Test runner | Vitest | 3.2.7 | MIT | 132 tests |
| Script runner | tsx | 4.23.15 | MIT | Generators and CLIs |
| Lint | ESLint + eslint-config-next | 9.39.5 / 15.5.28 | MIT | In use |
| Runtime | Node.js | 22.22.0 (local) | — | Version not pinned in the repository |
| Database | none | — | — | Absent (Part 03) |
| Authentication | none | — | — | Absent (Parts 07, 08A) |
| Real-time | none | — | — | Absent (Part 10) |
| Queue, cache, object storage, search | none | — | — | Absent |
| Mobile / PWA | none | — | — | Absent (Part 14) |
| PDF engine | none | — | — | Absent (Part 20) |
| CI / CD | none (no `.github`, `.gitlab-ci.yml`, Dockerfile) | — | — | Absent (Part 04) |

Production dependencies: 4. Development dependencies: 9. The `package-lock.json` pins versions. All licences are permissive (MIT, ISC, Apache-2.0); none is copyleft.

## Repository structure
| Area | Content | Files |
|---|---|---|
| `src/app/` | App Router: one route (`/`), root layout, global CSS | 1 route |
| `src/components/shell/` | Application shell | 1 |
| `src/design/` | Tokens (generated), icons, navigation, status chips, preferences | 6 |
| `src/domain/` | Annex B formulas and seed data | 10 |
| `src/program/` | Annex C/D/E index, rules, prompts, conventions, baseline, fitness | 17 |
| `design/` | Token source and navigation registry (JSON) | 2 |
| `scripts/` | Generators, token build, design gate, Part 01 tooling | 12 |
| `docs/erp-program/` | Programme documentation (Part 00 §11, Part 01 evidence) | — |

Tracked files: 66 at the time of the inventory (before this Part's files were added).

## Routes, screens and APIs
- **Routes:** 1 (`src/app/page.tsx`, the home launchpad with its empty state).
- **API route handlers:** 0 (search for `route.ts` returned none).
- **UI components:** 3 component files under `src/components` and `src/design`.
- **Navigation:** 13 business groups are declared in `design/navigation-registry.json`. One entry is live, so one group renders.

## Authentication and authorisation (where checks happen)
- **Authentication:** none. The search for authentication terms (`login`, `password`, `jsonwebtoken`, `bcrypt`, `argon2`, `next-auth`, `passport`) matched no source file.
- **Authorisation:** the navigation filter (`src/design/navigation.ts`) checks `permission === null` and so allows every entry. This is a UI-only stub with no server enforcement (N10). Finding R-03.

## Data, workflow, jobs, sockets, integrations
| Category | Search result | Evidence |
|---|---|---|
| Database access and schema | none | `database` search: 0 files |
| Workflow engine | none | no workflow code |
| Background jobs and schedules | none | `jobsAndSchedules` search: 0 files |
| Real-time sockets | none | `realtimeSockets` search: 0 files |
| Queues and message bus | none | `queuesAndBus` search: 0 files |
| Outbound HTTP integrations | none | `httpIntegrations` search: 0 files |
| Documents and PDF | none | `documentsAndPdf` search: 0 files |
| Government / tax APIs | none; tax terms appear only in reference seeds | `paymentsAndTax`: 5 files, all seeds or tests |
| Feature flags | none live; one convention test | `featureFlags`: 1 file (`conventions.test.ts`) |

## Calculations
42 exported formulas in `src/domain/` (Annex B3, B4, B6, B7). Full list in `CALCULATION_REGISTRY.md`. 14 arithmetic lines matched the keyword scan; the scan misses some formulas, so the registry is built from the exported-symbol list, not the scan.

## Tests and quality gates
- **Tests:** 132 pass across 12 files (domain formulas and seeds, program invariants, prompts, conventions, adoption files, baseline classifier, fitness rubric).
- **Lint:** clean.
- **Typecheck:** clean.
- **Build:** production build succeeds. First-load JavaScript for `/` is 103 kB shared, 123 B route-specific (measured).
- **Design gate:** `npm run check:design` reports 4 failing contrast pairings (CF-004).
- **CI:** none. The gates above run only when a person runs them.

## Security observations (for Part 08; access-restricted per Part 01 §15)
- No authentication or server-side authorisation exists (see above).
- Dependency advisories: production scope 2 (moderate `next`, high `postcss` via `next`); development scope 8 including 2 critical (`vitest`, `tinypool`). Details in `RISK_REGISTER.md` R-02. Remediation is not applied here; the fix paths are major upgrades (Next 16.x, Vitest 5.x).
- Secret-pattern scan (AWS keys, private-key blocks, assigned secrets): 0 matches. The scan records file and line only.

## Environments and deployment
None in the repository. No Dockerfile, no infrastructure code, no environment configuration files other than `.gitignore`. Deployment topology is unknown and is recorded as unknown.

## Database entity map
`DB_ENTITY_MAP.csv` has a header row only. The repository holds no tables, so no entity exists to map (REQ-DISC-F03). Data-quality profiling (duplicates, orphans, float money columns) is not applicable without a database.
