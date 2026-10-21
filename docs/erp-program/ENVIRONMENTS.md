# ENVIRONMENTS (blueprint)

Part 02, REQ-ARCH-F13 and ADR-011. Status: **blueprint only**. No environment has been provisioned. The cloud provider and region are open (CF-012), so no infrastructure code exists yet.

## Environments
| Environment | Purpose | Data | Release | Feature flags | Access |
|---|---|---|---|---|---|
| Local developer | Build and test on a laptop (see LOCALHOST.md) | Synthetic seed data only | Manual | Default OFF | Developer |
| CI | Quality gates on every push (`.github/workflows/ci.yml`) | None (tests use fixtures inside the tests) | Automatic on push | — | Pipeline only |
| Test | Integration and contract tests on deployed services | Synthetic | On merge to the main branch | Per test | Test engineers |
| Staging | Production-like rehearsal; restore of a production-sized copy | Anonymised production copy (Part 84) | Release candidate | Mirror of production | Release managers |
| Preview or sandbox | Demos and training (Part 81) | Synthetic, isolated | On request | ON for the scenario | Product and training |
| Production | Live operations | Live | Blue-green or canary | Default OFF until accepted (U18) | Operations, with step-up MFA |
| DR | Standby for disaster recovery | Replica | Not deployed for changes | — | Operations |

## Rules
- Seed data is kept out of production builds (constitution §14, CI rule owned by Part 04).
- Secrets come from the vault, never from the repository (N12).
- A release needs: quality gates green, the golden baseline check passing or its changes approved, the migration reviewed, and a rollback rehearsed.
- Production deployments use blue-green or canary; the previous version stays available until the new one passes health checks.

## What exists today
- Local development: `npm run dev` on `http://localhost:3000` (see LOCALHOST.md).
- CI: quality job blocking; design and audit jobs non-blocking (CF-004, R-02).
- No staging, test, preview, production or DR environment.

## Next steps (owner decision first)
1. Name the cloud provider and region (CF-012).
2. Write the Terraform modules for network, database, object storage, cache and container platform.
3. Provision test and staging; run a restore drill with a synthetic production-sized dataset (Part 03 provides it).
