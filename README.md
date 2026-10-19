# ERP Construction

Integrated construction / EPC ERP. This repository is a fresh Next.js + TypeScript project (App Router) that replaces the earlier spec pack and build code.

## Stack

- Next.js 15 (App Router) with React 19
- TypeScript
- ESLint (Next.js config)

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run build:tokens` | Regenerate `src/design/tokens.css` from `design/design-tokens.json` |
| `npm run build:program` | Regenerate `src/program/parts.generated.json` from the Annex C index |
| `npm run build:legacy` | Regenerate `src/program/legacy.generated.json` from the Annex D crosswalk |
| `npm run build:prompts` | Regenerate the Annex E templates in `src/program/prompts.generated.json` |
| `npm run prompt -- --part 25A --slice S2` | Print a filled session prompt (E1; also `--template E1-legacy\|E2…E8`, `--template E4 --phase 3`) |
| `npm test` | Run the domain formula and reference-data tests (Vitest) |
| `npm run check:design` | Design gate: WCAG contrast for every token pairing and a raw-colour lint (DS-4, DS-7) |

## Design system (Part 00 Annex A)

- `design/design-tokens.json` is the single source for colour, type, spacing, density, motion and layout. Edit it, then run `npm run build:tokens`. Do not edit `src/design/tokens.css` by hand.
- Light, dark (follows the OS until a theme is chosen) and high-contrast themes are switched with `data-theme` on `<html>`. Density uses `data-density`.
- Modules use semantic tokens only: no hex, rgb or hsl literals outside the token package.
- `design/navigation-registry.json` holds the DS-13 groups and entries. The side navigation shows an entry only when its route is live (`LIVE_ROUTES` in `src/design/navigation.ts`), and hides a group that has no visible entries.
- Icons are referenced by semantic key (`src/design/icons.tsx`), never by glyph file.
- `StatusChip` (`src/design/StatusChip.tsx`) renders the DS-6 workflow states as icon plus text.

## Construction domain (Part 00 Annex B)

`src/domain/` holds the reference formulas and seeds from Annex B, as pure TypeScript with no UI dependency:

- `kpi.ts`: KPI formulas (B7), each returning `null` when the denominator is zero.
- `commercial.ts`: advance recovery, retention, price variation, liquidated damages, BOQ deviation (B3).
- `reinforcement.ts`: unit weight, bend deduction and cut length (B4).
- `numbering.ts`: document number templates (B8), refusing any missing segment.
- `uom.ts`, `norms.ts`, `roles.ts`, `structures.ts`, `glossary.ts`: seed reference data (B1, B2, B6, B9, B10, B11, B12).
- `statutory.ts`: B5 obligations, all marked `seed-unconfirmed` until their owner confirms them.

Every rate, threshold and index here is a seed or a parameter, not a constant the ERP applies.

## Program index (Part 00 Annex C)

`docs/program/annex-c-master-index.md` is the source. `scripts/build-program-index.mjs` generates `src/program/parts.generated.json` (95 Parts, 15 phases). `src/program/` answers the execution questions: which Parts may start (`canStart`, `runnableNow`), which may run in parallel (`canRunInParallel`), and what each Part depends on (`transitiveDependencies`). `src/program/verify.ts` checks the Annex C3 ordering invariants, and the tests run them.

## Legacy crosswalk (Part 00 Annex D)

`src/program/legacy.ts` maps the 167 old prompts (00–166) to the Parts that own them, lists the VERIFY & EXTEND Parts, the consolidations, the legacy module-code aliases, and the uploaded Plant and WorkChat module crosswalks. Tests check that the annex's tables agree with each other and with the Annex C index.

## Session prompts (Part 00 Annex E)

`npm run prompt` fills the Annex E templates from the program index and the legacy crosswalk: Part title, module code, start mode, dependencies, legacy prompt IDs and the phase name. Anything the session owner must supply, such as attached documents or a test name, stays as a visible placeholder, and the CLI lists those.

## Layout

```
design/         Token and navigation sources (JSON)
scripts/        Token generator and design gate
src/app/        App Router pages, layout and global styles
src/components/ Application shell
src/design/     Tokens (generated CSS), icons, navigation, status chips, preferences
src/domain/     Construction formulas and reference seeds (Annex B)
src/program/    Part index, start rules and ordering checks (Annex C)
docs/program/   Annex C, D and E source documents
public/         Static assets
```
