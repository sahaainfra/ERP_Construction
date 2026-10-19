# DEPENDENCY_MAP

Part 01, REQ-DISC-F09. Module-to-module dependencies, computed from import statements by `scripts/erp-program/inventory.mjs` (field `importGraph`). Local imports only; package imports are excluded.

## Summary
- Source files with local imports: 24. Local import edges: 12.
- **Import cycles: 0.** Checked by depth-first search over the local import graph.
- **Shared tables:** none (no database).
- **Direct cross-module writes:** none (no database writes).
- **Hidden coupling through triggers:** none (no triggers).
- **Events:** none.

## Edges
| From | To |
|---|---|
| `src/app/layout.tsx` | `src/components/shell/AppShell.tsx`, `src/design/preferences.ts` |
| `src/components/shell/AppShell.tsx` | `src/design/icons.tsx`, `src/design/navigation.ts`, `src/design/preferences.ts` |
| `src/design/navigation.ts` | `src/design/icons.tsx` |
| `src/design/StatusChip.tsx` | `src/design/icons.tsx` |
| `src/program/legacy.ts` | `src/program/index.ts` |
| `src/program/prompts.ts` | `src/program/index.ts`, `src/program/legacy.ts` |
| `src/program/verify.ts` | `src/program/index.ts` |
| `scripts/render-session-prompt.ts` | `src/program/prompts.ts` |

## Observations
- `src/domain/` has no outgoing or incoming local edges. It is a leaf layer, which is correct for pure formulas. When Part 22 consumes it, the edge must be recorded here.
- `src/program/` has a clear core (`index.ts`) that the other modules import. It has no dependency on the application shell.
- The shell (`src/components`, `src/design`) does not import `src/domain` or `src/program`. The UI and the business logic are separated today. This must be kept when screens start calling services (N9).
- Golden test and baseline modules import domain and program modules, but nothing imports them back. The test layer is a leaf.
