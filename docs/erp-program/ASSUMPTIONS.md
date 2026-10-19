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

## Not assumed
These items cannot be assumed, because they are statements of fact or legal confirmation by named people:
- **Statutory rates and thresholds and their owners (CF-005).** The owners must confirm the rates in `src/domain/statutory.ts` against the sources in force.
- **Full annex lists (CF-006).** The content is not in the repository and cannot be reconstructed.
