import registry from "../../design/navigation-registry.json";
import type { IconKey } from "./icons";

export type NavGroup = (typeof registry.groups)[number] & { icon: IconKey };
export type NavEntry = (typeof registry.entries)[number] & { icon: IconKey };

// Routes that are implemented and healthy. An entry renders only when its route is listed here (DS-13).
// Each Part adds its routes here when it ships.
const LIVE_ROUTES = new Set<string>(["/"]);

// Identity and permissions are not built yet (Part 07). Until they are, every entry is treated as permitted.
function userMayOpen(entry: NavEntry): boolean {
  return entry.permission === null;
}

export function visibleGroups(): { group: NavGroup; entries: NavEntry[] }[] {
  const groups = [...registry.groups].sort((a, b) => a.order - b.order) as NavGroup[];
  const entries = registry.entries as NavEntry[];

  return groups
    .map((group) => ({
      group,
      entries: entries
        .filter((e) => e.group === group.id && LIVE_ROUTES.has(e.route) && userMayOpen(e))
        .sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.entries.length > 0); // A group appears only when it has at least one entry (DS-13).
}
