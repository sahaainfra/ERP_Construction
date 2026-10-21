# TECH_RADAR

Part 02, REQ-ARCH-F15. Rings: **ADOPT** (use for new work), **TRIAL** (use on one bounded piece), **ASSESS** (evaluate; no production use), **HOLD** (do not start new use).

Versions were read from the npm registry on 2026-10-19. Support windows are stated only where verified in this session; otherwise the entry says so. Policy: LTS or current supported releases only; lockfiles committed; SBOM generated per release (Part 04).

| Technology | Role | Installed | Latest verified | Ring | Notes |
|---|---|---|---|---|---|
| Node.js | Runtime | 22.22.0 | 22 (LTS line) | ADOPT | Pinned by `.nvmrc` and `engines` (D-016). Support end for the 22 line per the Node.js release schedule: verify before each release. |
| Next.js | Application framework | 15.5.28 | 16.4.2 (released 2026-10-15) | TRIAL 16.x | Upgrade is a tested change under R-02. 15.5.28 released 2026-10-14. |
| React | UI library | 19.1.0 | 19.3.1 | ADOPT 19.x | Minor upgrade within the major. |
| TypeScript | Language | 5.9.3 | 7.0.2 | ASSESS 7.x | Major release; check compiler compatibility with Next and Vitest before any move. |
| Vitest | Test runner | 3.2.7 | 5.0.5 | ASSESS 5.x | Current advisories fixed in 5.x (R-02). Test on the existing suite first. |
| tsx | Script runner | 4.23.15 | 4.23.15 | ADOPT | Programme tooling only; not in the production bundle. |
| lucide-react | Icon family | 1.59.0 | 1.59.0 | ADOPT | Single icon family (Annex A DS-10). |
| ESLint | Lint | 9.39.5 | — | ADOPT 9.x | eslint-config-next 15.5.28 pinned to the Next line. |
| decimal.js | Decimal arithmetic | not installed | 10.6.0 | TRIAL (pending ADR-004 approval) | Replaces float money (REPLACE-candidate 1). |
| @tanstack/react-query | Server-state cache | not installed | 5.104.5 | TRIAL (pending ADR-007 approval) | The single server-state library. |
| zod | Input validation schemas | not installed | 4.6.7 | ASSESS | Needed for server-side validation (AC-4). Requires its own ADR before adoption. |
| PostgreSQL | Operational database | not installed | 15 or later (constitution) | ADOPT (decided by ADR-003) | Version to pin in Part 03. |
| Redis | Cache, sessions, queue | not installed | — | ADOPT (ADR-003, ADR-006) | Version to pin in Part 03. |
| BullMQ | Queue | not installed | — | ASSESS (ADR-006) | Only with ADR-006 approved. |
| OpenSearch | Search | not installed | — | HOLD | Only if the search trigger in ADR-003 is met. |
| Kafka | Streaming | not installed | — | HOLD | Rejected for v1 (ADR-006). |
| Socket.IO | Real-time | not installed | — | HOLD | No real-time need decided yet; Part 10 decides with ADR. |
| Chart libraries | Charts | not installed | — | HOLD | Choose one charting library with an ADR when the first chart is built (Annex A DS-11). |
| Terraform | Infrastructure as code | not installed | — | ASSESS (ADR-011) | Blocked by CF-012. |
