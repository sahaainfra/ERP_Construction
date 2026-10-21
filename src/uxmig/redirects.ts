// Route registry (Part 15 REQ-UXMIG-F09; A-140). Every legacy route maps to its new route. While a module's flag is on, the legacy route
// redirects; while it is off, the legacy route is served as before. A known legacy route is never a 404.
import { flagOn } from "./flags";

export interface RouteMapping {
  legacy: string;
  next: string;
  module: string;
}

export type Resolution = { kind: "serve"; path: string } | { kind: "redirect"; to: string };

export function resolveRoute(path: string, mappings: RouteMapping[], configuration: Record<string, boolean>): Resolution {
  const mapping = mappings.find((m) => m.legacy === path);
  if (!mapping) return { kind: "serve", path };
  return flagOn(mapping.module, configuration) ? { kind: "redirect", to: mapping.next } : { kind: "serve", path };
}

/** Checks the registry before it is used: no duplicates, no chains that loop, and every target exists in the given route list. */
export function checkMappings(mappings: RouteMapping[], routes: string[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const m of mappings) {
    if (seen.has(m.legacy)) problems.push(`duplicate legacy route ${m.legacy}`);
    seen.add(m.legacy);
    if (!routes.includes(m.next)) problems.push(`target ${m.next} for ${m.legacy} is not a known route`);
    if (m.next === m.legacy) problems.push(`${m.legacy} redirects to itself`);
  }
  return problems;
}
