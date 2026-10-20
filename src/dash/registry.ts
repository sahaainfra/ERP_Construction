// Widget registry as code (Part 13 REQ-DASH-F01, F02; A-94). A widget is registered here only when its owning module is live, and
// its definition passes `widgetProblems`. Loaders run inside the permission the widget declares.
import { widgetProblems, type WidgetDefinition } from "./types";
import { WIDGETS } from "./widgets";

/** Modules whose data is live. A widget owned by a module outside this set is never shown (A-93). */
export const LIVE_MODULES: ReadonlySet<string> = new Set(["org", "secgov", "auth"]);

export function registryProblems(defs: readonly WidgetDefinition[]): string[] {
  const problems = defs.flatMap((d) => widgetProblems(d));
  const codes = defs.map((d) => d.code);
  for (const code of new Set(codes)) {
    if (codes.filter((c) => c === code).length > 1) problems.push(`${code}: registered twice`);
  }
  return problems;
}

/** Throws when the registry is not valid. Called by the runtime, so an invalid registry cannot be served. */
export function assertRegistryValid(defs: readonly WidgetDefinition[] = WIDGETS): void {
  const problems = registryProblems(defs);
  if (problems.length > 0) throw new Error(`widget registry is not valid:\n${problems.join("\n")}`);
}

export function findWidget(code: string, defs: readonly WidgetDefinition[] = WIDGETS): WidgetDefinition | undefined {
  return defs.find((d) => d.code === code);
}
