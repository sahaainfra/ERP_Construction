# Program documentation (`docs/erp-program/`)

Single documentation root for the program (constitution §11). Status of each file below.

| File | Status | Produced by |
|---|---|---|
| `PROGRAM_RULES.md` | Present (adopted constitution) | Part 00 |
| `annexes/` | Present (Annexes C, D, E; the constitution is `PROGRAM_RULES.md`) | Part 00 |
| `LEGACY_CROSSWALK.csv` | Present | Part 00 |
| `LEGACY_MAPPING.md` | Present | Part 00 |
| `PROGRESS_REGISTER.csv` | Present (seeded; 95 Parts) | Part 00 |
| `DECISIONS.md` | Present | Part 00 |
| `CONFLICTS.md` | Present | Part 00 |
| `CHANGELOG.md` | Present | Part 00 |
| `modules/disc/` | Present (Part 01 evidence: discovery, inventory, traceability) | Part 01 |
| `EXISTING_SYSTEM_MAP.md`, `CALCULATION_REGISTRY.md`, `ITEM_LIKE_MASTERS.md`, `CONTROL_INVENTORY.md`, `DEPENDENCY_MAP.md`, `COMMUNICATION_INVENTORY.md`, `ARCHITECTURE_FITNESS.md`, `RISK_REGISTER.md`, `BASELINE_REPORT.md`, `GAP_MATRIX.csv`, `GOLDEN_OUTPUTS/`, `runbooks/` | Present (Part 01, repository scope) | Part 01 |
| `DB_ENTITY_MAP.csv` | Present, header only (no legacy tables; the `sys` objects are listed in DB_EXTENSIONS.md) | Part 01 |
| `LOCALHOST.md` (repository root) | Present | Part 02 |
| `DB_GUIDE.md`, `DB_EXTENSIONS.md`, `modules/dbf/` (schema review, discovery) | Present | Part 03 |
| `runbooks/database-rollback-and-restore.md` | Present | Part 03 |
| `ARCHITECTURE.md`, `adr/`, `TECH_RADAR.md`, `BUILD_VS_BUY.md`, `ENVIRONMENTS.md`, `DEPENDENCY_ALLOWLIST.json` | Present (Part 02, drafted; ADRs PROPOSED) | Part 02 |
| `MIGRATION_LOG.md` | Not produced (the migration register in the database is the log) | Part 03 |
| `EVENT_CATALOGUE.md` | Not produced | Parts 10, 11 |
| `PERMISSION_REGISTRY.md` | Not produced | Part 07 |
| `PROTOCOL_REGISTER.md` | Not produced | Part 17 |
| `POSTING_RULES.md` | Not produced | Part 26 |
| `KPI_CATALOGUE.md`, `REPORT_CATALOGUE.md` | Not produced | Parts 75, 76 |
| `RESPONSIBILITY_MATRIX.md` | Not produced | Part 17 |
| `TRACEABILITY_MATRIX.csv` | Present, header only (roll-up) | Part 04 |
| `modules/<code>/…` | Not produced (created per Part, §1.3 evidence root) | Each Part |
| `runbooks/` (database and storage) | Not produced | Parts 84, 85 |

Regenerate the CSVs and the machine-readable annex data with `npm run build:program`, `npm run build:legacy`, `npm run build:prompts` and `node scripts/adopt-program.mjs`.
