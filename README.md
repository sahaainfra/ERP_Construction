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
| `npm run check:design` | Design gate: WCAG contrast for every token pairing and a raw-colour lint (DS-4, DS-7) |

## Design system (Part 00 Annex A)

- `design/design-tokens.json` is the single source for colour, type, spacing, density, motion and layout. Edit it, then run `npm run build:tokens`. Do not edit `src/design/tokens.css` by hand.
- Light, dark (follows the OS until a theme is chosen) and high-contrast themes are switched with `data-theme` on `<html>`. Density uses `data-density`.
- Modules use semantic tokens only: no hex, rgb or hsl literals outside the token package.
- `design/navigation-registry.json` holds the DS-13 groups and entries. The side navigation shows an entry only when its route is live (`LIVE_ROUTES` in `src/design/navigation.ts`), and hides a group that has no visible entries.
- Icons are referenced by semantic key (`src/design/icons.tsx`), never by glyph file.
- `StatusChip` (`src/design/StatusChip.tsx`) renders the DS-6 workflow states as icon plus text.

## Layout

```
design/         Token and navigation sources (JSON)
scripts/        Token generator and design gate
src/app/        App Router pages, layout and global styles
src/components/ Application shell
src/design/     Tokens (generated CSS), icons, navigation, status chips, preferences
public/         Static assets
```
