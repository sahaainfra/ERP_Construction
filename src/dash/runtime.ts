// Widget runtime (Part 13 REQ-DASH-F01, F02; A-93). Runs the widgets a viewer may see, in parallel, each with its own timeout and its
// own error. A widget the viewer may not see, or whose module is not live, is excluded before it runs: it is never loaded, and nothing
// is shown in its place.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { can } from "../iam/pdp";
import { telemetryLogger } from "../obs/telemetry";
import { LIVE_MODULES, assertRegistryValid, findWidget } from "./registry";
import { WIDGETS } from "./widgets";
import type { WidgetDefinition, WidgetResult } from "./types";

export const WIDGET_TIMEOUT_MS = 2_000;

export interface RunOptions {
  now?: Date;
  timeoutMs?: number;
  liveModules?: ReadonlySet<string>;
  definitions?: readonly WidgetDefinition[];
}

export type Outcome =
  | { code: string; title: string; status: "ok"; result: WidgetResult }
  | { code: string; title: string; status: "error" | "timeout"; message: string };

/** The widgets in `codes`, in that order, that the viewer may see now. Unknown codes and hidden widgets are dropped silently. */
export async function permittedWidgets(pool: Pool, ctx: RequestContext, codes: readonly string[], opts: RunOptions = {}): Promise<WidgetDefinition[]> {
  assertRegistryValid(opts.definitions ?? WIDGETS);
  const live = opts.liveModules ?? LIVE_MODULES;
  const out: WidgetDefinition[] = [];
  for (const code of codes) {
    const def = findWidget(code, opts.definitions ?? WIDGETS);
    if (!def || !live.has(def.moduleCode)) continue;
    if (def.permissionKey !== null && !(await can(pool, ctx, def.permissionKey)).allowed) continue;
    out.push(def);
  }
  return out;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { widgetTimeout: true })), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** Runs the permitted widgets. One widget failing or timing out does not affect the others. */
export async function runWidgets(pool: Pool, ctx: RequestContext, codes: readonly string[], opts: RunOptions = {}): Promise<Outcome[]> {
  const defs = await permittedWidgets(pool, ctx, codes, opts);
  const now = opts.now ?? new Date();
  const timeoutMs = opts.timeoutMs ?? WIDGET_TIMEOUT_MS;
  return Promise.all(
    defs.map(async (def): Promise<Outcome> => {
      try {
        const result = await withTimeout(def.load(pool, ctx, now), timeoutMs);
        return { code: def.code, title: def.title, status: "ok", result };
      } catch (error) {
        const timedOut = (error as { widgetTimeout?: boolean }).widgetTimeout === true;
        // The person sees a plain message; the cause is logged, never shown.
        telemetryLogger().log("warn", "widget did not load", { widget: def.code, reason: timedOut ? "timeout" : (error as Error).name });
        return timedOut
          ? { code: def.code, title: def.title, status: "timeout", message: "This widget took too long to load. Try again." }
          : { code: def.code, title: def.title, status: "error", message: "This widget could not load." };
      }
    }),
  );
}
