# COMMUNICATION_INVENTORY

Part 01, REQ-DISC-F18. Input to the reuse decision for Parts 10 and 25–25C.

## Result
**Nothing to reuse.** The repository has no chat, no comments on records, no mentions, no activity feed, no notification centre, no email, SMS, WhatsApp or push integration, and no socket usage. Each category was searched and returned no file (see EXISTING_SYSTEM_MAP.md).

## Earlier WorkChat build (required check)
The requirement asks for any earlier standalone WorkChat build, identified by `docs/workchat/`, `/api/workchat/v1` and `wc_*` tables.

| Artefact | Searched | Found |
|---|---|---|
| `docs/workchat/` | repository tree | No |
| `/api/workchat/v1` routes | no `route.ts` files | No |
| `wc_*` tables | no database, no SQL | No |
| Progress evidence for WorkChat | `PROGRESS_REGISTER.csv`, legacy crosswalk | Registered only as legacy prompts 27, 28, 29 and 30 (Annex D). No code, evidence or audit record in the repository. |

## Decision
- **Part 10 (event bus and notifications):** leave. Nothing to reuse. Build to plan.
- **Parts 25, 25A, 25B, 25C (WorkChat):** start in the mode the programme index gives (VERIFY & EXTEND for 25, 25A, 25C, from Annex D2). Because no legacy code is present, that mode cannot be exercised. Owner decision required (CF-001). Until then these Parts behave as BUILD.
- If a legacy WorkChat build exists in another repository, it must be located and its evidence linked before Part 25 starts (Part 01 REQ-DISC-F17).
