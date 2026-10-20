# Assumptions register

Each assumption is a working decision taken where the source material or the owner's instructions are silent. An assumption is **not** an approval. Each row says what is assumed, why, what it does not cover, and who must confirm it. Assumptions are reversible and recorded in `DECISIONS.md` when they change what is built.

| ID | Assumption | Basis | Does not cover | Confirm with | Status |
|---|---|---|---|---|---|
| A-01 | This is a greenfield build. There is no legacy system, so no legacy data extract exists. | Owner's decision D-039 (CF-001 option b) and the owner's instruction to replace the earlier build. | Any legacy migration. If a legacy system appears, the legacy extract and Part 03 pilot are needed again. | Owner | In use |
| A-02 | Cloud provider and region: AWS, Mumbai (`ap-south-1`). | ADR-009 defaults to India-region data residency. AWS has a Mumbai region. | No infrastructure is provisioned. No account, credentials or cost limits exist. Deployment, rollback and metrics (CF-021) remain open. | Owner (CF-012) | Assumed, not confirmed |
| A-03 | The identity provider is a managed service with India-region data residency. | ADR-009 default. | Residency has not been verified for any provider. | Security architect (CF-013) | Assumed, not confirmed |
| A-04 | Production point-in-time recovery archives WAL to an object store in the region from A-02. | Standard practice for managed PostgreSQL. The rehearsal `scripts/db/pitr-rehearsal.sh` proves the mechanics locally. | No production archive exists. The retention period and recovery objectives are not set. | Owner (CF-016) | Assumed, not confirmed |
| A-05 | The reference module `ff.core.sample` stays off in every environment. | Part 05 REQ-CORE-F17. | Nothing. It is a demonstration only. | Technical lead | In use |
| A-06 | The local object-storage adapter is for development and tests only. | Part 05 REQ-CORE-F12. Object storage needs a provider. | Production storage, signed URLs and encryption (CF-027). | Technical lead | In use |
| A-07 | Hindi text is a draft until a reviewer approves it. | Part 05 REQ-CORE-F16. | Any user-facing Hindi that has not been reviewed. | Language reviewer | In use |

| A-08 | Contract mode is stored as free text (2 to 40 characters) for now. | Annex B2 values were not verified in this session. | The allowed list. It must be restricted to Annex B2 once confirmed. | Owner / commercial lead | Assumed |
| A-09 | A lost tender moves straight from Tendering to Closed, with no closure checklist. | No work was done, so there is no closure to check. | Any cost or claim after a lost tender. | Owner | Assumed |
| A-10 | Activation and closure gates stay closed until their slices exist (geofence S4, LBS S3, RACI Part 17, closure checklist S5). Until then each gate is passed only by a recorded exception with a second approver. | CP-ORG-01 and CP-ORG-03 require these items. | Projects are not activated without an exception until those slices are built. | Technical lead | In use |

| A-11 | Default location levels per project type follow the list in the Part 06 spec (building: tower, floor, zone; road: chainage stretch with LHS and RHS; bridge: pier and span; industrial: area, unit, system). | Annex B11 was not verified in this session. | Other location schemes, which need Annex B11 confirmed. | Owner / planning lead | Assumed |
| A-12 | Geofence distance uses the haversine formula on a sphere, accurate to about 0.5 %. A punch is inside when the distance is within radius plus accuracy tolerance. A fix worse than five times the tolerance is reported as low accuracy. | Adequate for fences of 20 m to 5 km; industry-standard approach for mobile punches. | Survey-grade geodesy or legal boundary disputes. | Technical lead | Assumed |

| A-13 | System roles from Annex B10 are not seeded yet. The first administrator is written directly by the owner. | Annex B10 was not verified in this session, and nothing can grant the first permission without a bootstrap. | The system roles and the break-glass procedure (S4). | Owner / IAM administrator | Assumed |
| A-14 | Authority limits: the most specific limit applies (project and category), and the lowest limit applies within one level. | Conservative: an unclear overlap never grants more. | Limit rules agreed with Finance. | CFO | Assumed |

| A-15 | The sixteen seed SoD rules use the action keys shown in `src/iam/sod.ts`. The owning modules will emit these keys and the names are confirmed then. | The spec names the pairs but not the keys; Annex B10 was not verified. | The exact keys and any module that uses different names. | Module owners | Assumed |
| A-16 | Actions are checked by the person (linked accounts count as one). The check uses an advisory lock per record. Permission checks for the action itself are the route's job, not the SoD engine's. | Keeps the SoD check independent of routes that do not exist yet. | Routes must call recordAction before any conflicting write (S5). | Technical lead | Assumed |

## Not assumed
These items cannot be assumed, because they are statements of fact or legal confirmation by named people:
- **Statutory rates and thresholds and their owners (CF-005).** The owners must confirm the rates in `src/domain/statutory.ts` against the sources in force.
- **Full annex lists (CF-006).** The content is not in the repository and cannot be reconstructed.
