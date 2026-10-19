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
| `EXISTING_SYSTEM_MAP.md`, `DB_ENTITY_MAP.csv`, `CALCULATION_REGISTRY.md`, `ITEM_LIKE_MASTERS.md`, `GOLDEN_OUTPUTS/` | Not produced | Part 01 |
| `ARCHITECTURE.md`, `adr/` | Not produced | Part 02 |
| `DB_EXTENSIONS.md`, `MIGRATION_LOG.md` | Not produced | Part 03 |
| `EVENT_CATALOGUE.md` | Not produced | Parts 10, 11 |
| `PERMISSION_REGISTRY.md` | Not produced | Part 07 |
| `PROTOCOL_REGISTER.md` | Not produced | Part 17 |
| `POSTING_RULES.md` | Not produced | Part 26 |
| `KPI_CATALOGUE.md`, `REPORT_CATALOGUE.md` | Not produced | Parts 75, 76 |
| `RESPONSIBILITY_MATRIX.md` | Not produced | Part 17 |
| `TRACEABILITY_MATRIX.csv` | Not produced | Part 04 (roll-up) |
| `modules/<code>/…` | Not produced (created per Part, §1.3 evidence root) | Each Part |
| `runbooks/` | Not produced | Parts 84, 85 |

Regenerate the CSVs and the machine-readable annex data with `npm run build:program`, `npm run build:legacy`, `npm run build:prompts` and `node scripts/adopt-program.mjs`.
