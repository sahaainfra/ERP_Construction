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

| A-17 | Passwords use scrypt (N=2^14, r=8, p=1), not Argon2id. Stored parameters let a hash be upgraded later. | Argon2id needs a native dependency that is not yet allowed; scrypt is an accepted password hash. | Move to Argon2id when the dependency is approved. | Technical lead / security architect | Assumed |
| A-18 | The identity provider is not named (CF-013). Sign-in uses the built-in engine until one is chosen; OIDC PKCE and claim rules are ready for it. | The owner asked for S1 to be settled; the choice needs a residency decision that is not verified. | Provider choice and ID-token signature verification (CF-013). | Owner; security architect | Assumed |
| A-19 | The route registry is a version-controlled manifest checked at build time, not a database table. | A manifest reviewed in code cannot be changed at run time, which is the safer default. | Mirror to a table only if run-time reporting needs it. | Technical lead | Assumed |
| A-20 | The pipeline writes its audit entry after the handler. A handler that writes business data must record its own audit in the same unit of work. | The pipeline cannot share a transaction with handlers it does not own. | Each write route follows this rule (S5 onward). | Technical lead | Assumed |
| A-21 | Revocation takes effect at once through a revoked timestamp. An end date alone is inclusive, so it cannot do that. | Revoking today must stop access now, not at midnight. | None. | Technical lead | In use |

| A-22 | Services accept times (`now`, `at`, `asOf`) for testing and replay. A route must never pass a time from the client; it passes the server clock. | The independent review found that a forwarded time could bypass lockout or expiry. | Route layer (S5 onward) must follow this rule. | Technical lead | Assumed |

| A-26 | The audit chain is one chain per tenant, with writes serialised by a per-tenant advisory lock. Throughput per tenant is therefore limited to one audit write at a time. Partitioning by month and the p95 target are not measured yet. | A single ordered chain is the simplest correct tamper evidence; per-tenant locks keep other tenants unaffected. | Measure under the Part 04 volume rehearsal; split chains by day or partition if the lock becomes the bottleneck. | Technical lead | Assumed |
| A-27 | Reason codes are free text in S1, checked for presence but not against a catalogue. | The catalogue is master data from Part 17. | Restrict to the catalogue when Part 17 exists. | Technical lead | Assumed |

| A-28 | Detection thresholds: brute force at five failures in 15 minutes; spray at ten accounts from one device in 15 minutes; lockout within 60 minutes; token reuse within a day (critical); privileged change at any count within 60 minutes; bulk export at 1,000 rows within 60 minutes. | Common practice for a first set; they are placed in one constant so the security lead can change them. | Confirmation by the security lead (CP-SECGOV-06 thresholds). | Security lead | Assumed |

## Not assumed
These items cannot be assumed, because they are statements of fact or legal confirmation by named people:
- **Statutory rates and thresholds and their owners (CF-005).** The owners must confirm the rates in `src/domain/statutory.ts` against the sources in force.
- **Full annex lists (CF-006).** The content is not in the repository and cannot be reconstructed.
