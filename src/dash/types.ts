// Widget contract (Part 13 REQ-DASH-F01; CP-DASH-01; A-93, A-101). A widget declares what it shows, where its number comes from, and
// where a person can drill to. A registration without these fields is refused at start-up.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";

export const DATA_LABELS = ["ACTUAL", "CALCULATED", "FORECAST", "AI", "PROVISIONAL"] as const;
export type DataLabel = (typeof DATA_LABELS)[number];

export interface MetricResult {
  kind: "metric";
  value: number;
  unit: string;
  period: string;
  label: DataLabel;
  formulaRef: string | null;
  asOf: string;
}

export interface ListResult {
  kind: "list";
  label: DataLabel;
  asOf: string;
  items: { text: string; href?: string }[];
}

export type WidgetResult = MetricResult | ListResult;

export interface WidgetDefinition {
  code: string;
  title: string;
  /** The Part that owns the data. The widget is registered only while this module is live (A-93). */
  ownerPart: string;
  moduleCode: string;
  /** Permission the viewer needs. `null` means any signed-in user. */
  permissionKey: string | null;
  metricCode: string;
  label: DataLabel;
  formulaRef: string | null;
  /** Human-readable threshold that colours or flags the number. */
  threshold: string;
  drillRoute: string;
  sizes: readonly ("s" | "m" | "l")[];
  load: (pool: Pool, ctx: RequestContext, now: Date) => Promise<WidgetResult>;
}

/** Start-up check. Returns the problems; an empty list means the definition may be registered (CP-DASH-01). */
export function widgetProblems(def: Omit<WidgetDefinition, "load"> & { load?: unknown }): string[] {
  const problems: string[] = [];
  const where = def.code || "(no code)";
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(def.code)) problems.push(`${where}: code must be lower-case words joined by hyphens`);
  if (!def.title || def.title.trim().length < 2) problems.push(`${where}: a title is required`);
  if (!/^\d{2}[A-Z]?$/.test(def.ownerPart)) problems.push(`${where}: the owning Part is required (for example 06 or 08A)`);
  if (!/^[a-z][a-z0-9]{1,15}$/.test(def.moduleCode)) problems.push(`${where}: the module code is required`);
  if (!(DATA_LABELS as readonly string[]).includes(def.label)) problems.push(`${where}: the data label must be one of ${DATA_LABELS.join(", ")}`);
  if (def.label === "CALCULATED" && !def.formulaRef) problems.push(`${where}: a calculated value needs a formula reference`);
  if (!def.metricCode || !/^[a-z][a-z0-9_.]{1,60}$/.test(def.metricCode)) problems.push(`${where}: the metric code is required`);
  if (!def.threshold || def.threshold.trim().length < 3) problems.push(`${where}: a threshold is required (state what flags the number)`);
  if (!def.drillRoute || !def.drillRoute.startsWith("/")) problems.push(`${where}: a drill path is required`);
  if (!def.sizes || def.sizes.length === 0) problems.push(`${where}: at least one size is required`);
  if (typeof def.load !== "function") problems.push(`${where}: a data loader is required`);
  return problems;
}
