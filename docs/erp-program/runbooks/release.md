# Release procedure (Part 04)

No production environment exists yet (CF-021). This runbook is the procedure to follow once one does, and it is the checklist used now for any change merged to `main`.

1. **Candidate.** The CI run on the commit is green in every blocking job: `quality`, `database`, `runtime`. The design gate and the production audit are non-blocking and must be reviewed, not ignored (CF-004, R-02).
2. **Change record.** Scope, risk, rollback plan, and migrations listed. Migrations that change data need a fresh verified backup (`npm run db:backup`) and a restore check.
3. **Approval.** The approver is not the author (`approvalProblem` in `src/program/release.ts`). Production flag changes for financial modules need business-owner approval.
4. **Staging.** Deploy the same artefact. Run `npm run e2e` and `npm run perf:smoke` against staging. Run `npm run env:check` with staging settings.
5. **Production.** Blue-green or canary, with feature flags default OFF (A3).
6. **Verify.** Health endpoint returns `ok`. Error rate and latency stay within budget for 30 minutes (CP-CICD-04).
7. **Rollback.** Switch traffic back to the previous version. Revert migrations only as described in `runbooks/database-rollback-and-restore.md`. Record the reason in the release record.
8. **Record.** Update `CHANGELOG.md` and the release state (`DRAFT → CANDIDATE → STAGING_VERIFIED → APPROVED → DEPLOYING → LIVE | ROLLED_BACK`).
