# ITEM_LIKE_MASTERS

Part 01, REQ-DISC-F07. Input to Part 23 (Item Master and Item Selector).

**Result: no item-like master exists in the repository.** There are no materials, services, labour categories, equipment types, BOQ libraries or SOR tables stored anywhere, because there is no database (see EXISTING_SYSTEM_MAP.md). Therefore no keys, overlaps or duplicates can be found. The check is recorded as an empty result, and no master is invented.

## Reference seeds that will become masters (Annex B)
These are written as constants in `src/domain/` and are seeds for the masters, not masters themselves. Each is a candidate for Part 21 or Part 23, and each must not be copied into a second master later.

| Seed | File | Count | Intended owner |
|---|---|---|---|
| Units of measure (B9) | `src/domain/uom.ts` | 24 codes | Part 21 (UOM master) |
| Wastage allowances (B6) | `src/domain/norms.ts` | 10 materials | Part 29 / 45 (per item version later) |
| Formwork repetitions (B6) | `src/domain/norms.ts` | 3 systems | Part 49 |
| Expert roles and personas (B1, B10) | `src/domain/roles.ts` | 11 roles, 5 persona groups | Parts 07 and 54 |
| Contract models and standard conditions (B2) | `src/domain/structures.ts` | 17 models, 5 standards | Part 31 |
| Project structures (B11) | `src/domain/structures.ts` | 5 structures | Parts 32, 33 |
| Document numbering series (B8) | `src/domain/numbering.ts` | 32 series | Part 05 numbering service |
| Statutory obligations (B5) | `src/domain/statutory.ts` | 6 areas, unconfirmed | Parts 27, 56 |
| Bend deduction factors (B4) | `src/domain/reinforcement.ts` | 4 angles | Part 35 |

## Duplication risks to resolve before Part 23
- **Units of measure** are defined once in `src/domain/uom.ts`. Annex B9 says conversions go through the UOM master only; this seed is not that master.
- **Numbering series** are seeded here, including `PO` and `WO`, which also belong to Parts 46 and 59. The numbering service in Part 05 must be the single owner of every series.
- **Wastage** appears in B6 and again as a rule in Part 00 §9.4 with the same percentages. Consolidate on one source when Part 21 is built.

## Gaps
Every master listed in Part 21 and Part 23 (items, resources, categories, equipment types, vendors, employees, plant, projects, sites) is absent. Their discovery is not applicable until a database exists.
