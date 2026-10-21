// Navigation model (Part 12 REQ-DS-F04; DS-13/14; A-76). Client-safe: no database access. The permitted permission keys are
// computed on the server (navigation-access.ts) and passed in, so the browser never decides what a user may open.
import registry from "../../design/navigation-registry.json";
import type { IconKey } from "./icons";

export type NavGroup = (typeof registry.groups)[number] & { icon: IconKey };
export type NavEntry = (typeof registry.entries)[number] & { icon: IconKey };

// Routes that are implemented and healthy. An entry renders only when its route is listed here (DS-13).
// Each Part adds its routes here when it ships.
export const LIVE_ROUTES: ReadonlySet<string> = new Set<string>(["/"]);

export const MOBILE_SLOTS = ["today", "inbox", "capture", "tasks", "more"] as const;

/** Every permission key that a navigation entry names. The server checks these for the signed-in user. */
export function navigationPermissionKeys(entries: readonly { permission: string | null }[] = registry.entries): string[] {
  return [...new Set(entries.map((e) => e.permission).filter((k): k is string => k !== null))];
}

export interface Navigation {
  groups: { group: NavGroup; entries: NavEntry[] }[];
  bottom: NavEntry[];
}

/**
 * The navigation a user may see: live routes whose permission the user holds (an entry with no permission is open to everyone
 * who is signed in). A group appears only when it has an entry (DS-13). Entries for the bottom bar come from the mobile slots.
 */
export function navigationFor(permitted: ReadonlySet<string>, entries: readonly NavEntry[] = registry.entries as NavEntry[]): Navigation {
  const groups = [...registry.groups].sort((a, b) => a.order - b.order) as NavGroup[];
  const visible = entries
    .filter((e) => LIVE_ROUTES.has(e.route) && (e.permission === null || permitted.has(e.permission)))
    .sort((a, b) => a.order - b.order);
  return {
    groups: groups
      .map((group) => ({ group, entries: visible.filter((e) => e.group === group.id) }))
      .filter((g) => g.entries.length > 0),
    bottom: MOBILE_SLOTS.map((slot) => visible.find((e) => e.mobile_slot === slot)).filter((e): e is NavEntry => e !== undefined),
  };
}

/** The entries a user may open, in order, for pinned and recent lists. */
export function openableEntries(permitted: ReadonlySet<string>): NavEntry[] {
  return navigationFor(permitted).groups.flatMap((g) => g.entries);
}

/** Kept for the shell's first render, before the server has sent the permitted keys: only open entries show. */
export function visibleGroups(): Navigation["groups"] {
  return navigationFor(new Set()).groups;
}
