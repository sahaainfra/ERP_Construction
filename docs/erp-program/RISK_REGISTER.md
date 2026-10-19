# RISK_REGISTER

Part 01, REQ-DISC-F16. Owner: programme manager. Severity follows Part 00 §5.8 (Critical, High, Medium, Low). Remediation is not applied in Part 01 (§2 Out of scope). Each risk names the Part that owns the fix.

| ID | Severity | Risk | Evidence | Owner Part | Target | Status |
|---|---|---|---|---|---|---|
| R-01 | High | The constitution assumes a live system with legacy code and evidence. None is in the repository, so all legacy-built marks are unverified and VERIFY & EXTEND cannot be exercised. | CF-001; `GAP_MATRIX.csv` (legacy_prompts column empty) | 01 (decision by owner) | Before Part 02 starts | Open, owner decision |
| R-02 | Critical (dev) / High (prod) | Dependency advisories. **Production:** `next` 15.5.28 moderate (fixed in 16.4.2), `postcss` high via `next` (fixed in 16.4.2). **Development:** `vitest` 3.2.7 critical and `tinypool` critical (fixed in Vitest 5.0.5); `eslint-config-next` high (npm's proposed fix is 14.2.35, a downgrade from 15.5.28, and is not accepted). | `inventory.json` → `audit` | 08 (security); 04 (pipeline) | Before any deployment | Open. Major upgrades need an ADR (Part 02). |
| R-03 | Critical | The application has no authentication, and the navigation permission check is a stub that allows every entry. | `src/design/navigation.ts` (`userMayOpen`); `searches.authentication` empty | 07, 08A | Before any data is entered | Open. Raised by the §7 rule (security score 0). |
| R-04 | High | Money is computed with floating-point numbers. Golden value `commercial.priceVariation` = 999.9999999999995 (expected 1000). AC-7 forbids this. | `GOLDEN_OUTPUTS/baseline.json`; `src/domain/commercial.ts` | 22 (engine), 02 (decision) | Before any persistence | Open. The unit test used `toBeCloseTo` and hid the error. |
| R-05 | Medium | Four token contrast pairings fail DS-7 (`brand.accent`, `status.warning.solid`). | `npm run check:design`; CF-004 | 12 (design owner) | Before design sign-off | Open |
| R-06 | Medium | No CI pipeline. Tests, lint, the design gate and the baseline check run only when a person runs them. | `inventory.json` → `ciConfiguration: []` | 04 | Before Part 05 | Open |
| R-07 | Medium | Leakage points, controls and detection rules cannot be assessed because the modules that hold them are absent. | `CONTROL_INVENTORY.md` | 17, 77 | Per Part | Accepted until those Parts run |
| R-08 | Medium | The golden baseline covers formulas, programme invariants and rendered prompts. It does not cover a database, API responses, reports or screens, because none exist. | `GOLDEN_OUTPUTS/README.md` | 03, 04 | Per Part | Open |
| R-09 | Low | Node version is not pinned in the repository (local 22.22.0). | `package.json` has no `engines` field | 04 | Part 04 | Open |
| R-10 | Low | `tsx` and `vitest` are development-only, but the baseline and fitness CLIs depend on `tsx`. A change to `tsx` would change the tooling. | `package.json` | 04 | Part 04 | Accepted |
