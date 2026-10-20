// Part 13 S1 pure tests: the widget contract (CP-DASH-01), the registry, and the runtime's isolation, timeouts and liveness rules.
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { widgetProblems, type WidgetDefinition } from "./types";
import { registryProblems, assertRegistryValid, LIVE_MODULES } from "./registry";
import { runWidgets } from "./runtime";
import { WIDGETS } from "./widgets";

const ctx = { userId: "ASHA00001", tenantId: "11111111-1111-4111-8111-111111111111" } as unknown as RequestContext;
const pool = {} as Pool;
const base: WidgetDefinition = {
  code: "sample-metric",
  title: "Sample metric",
  ownerPart: "06",
  moduleCode: "org",
  permissionKey: null,
  metricCode: "org.sample.count",
  label: "ACTUAL",
  formulaRef: null,
  threshold: "flags when the count is zero",
  drillRoute: "/projects",
  sizes: ["s"],
  load: async () => ({ kind: "metric", value: 1, unit: "x", period: "now", label: "ACTUAL", formulaRef: null, asOf: "2026-10-20T00:00:00Z" }),
};

describe("widget contract (CP-DASH-01)", () => {
  it("accepts a complete definition", () => {
    expect(widgetProblems(base)).toEqual([]);
  });
  it("refuses a definition without a threshold, a drill path or a formula for a calculated value", () => {
    expect(widgetProblems({ ...base, threshold: "" }).join(" ")).toMatch(/threshold/);
    expect(widgetProblems({ ...base, drillRoute: "projects" }).join(" ")).toMatch(/drill path/);
    expect(widgetProblems({ ...base, label: "CALCULATED", formulaRef: null }).join(" ")).toMatch(/formula reference/);
    expect(widgetProblems({ ...base, label: "GUESS" as never }).join(" ")).toMatch(/data label/);
  });
  it("refuses a duplicate code and an invalid registry", () => {
    expect(registryProblems([{ ...base, load: base.load }, { ...base, load: base.load }]).join(" ")).toMatch(/registered twice/);
    expect(() => assertRegistryValid([{ ...base, threshold: "" } as WidgetDefinition])).toThrow("widget registry is not valid");
  });
  it("the shipped registry is valid, and every widget's owner module is live", () => {
    expect(registryProblems(WIDGETS)).toEqual([]);
    for (const w of WIDGETS) expect(LIVE_MODULES.has(w.moduleCode), w.code).toBe(true);
  });
});

describe("widget runtime (REQ-DASH-F01, F02)", () => {
  it("never loads a widget whose module is not live", async () => {
    let loaded = false;
    const defs = [{ ...base, load: async () => { loaded = true; return base.load(pool, ctx, new Date()); } }];
    const outcomes = await runWidgets(pool, ctx, ["sample-metric"], { definitions: defs, liveModules: new Set(["secgov"]) });
    expect(outcomes).toEqual([]);
    expect(loaded).toBe(false);
  });
  it("isolates a failing widget from the others", async () => {
    const defs = [
      { ...base, code: "good-one", load: base.load },
      { ...base, code: "bad-one", load: async () => { throw new Error("db connection reset"); } },
    ];
    const outcomes = await runWidgets(pool, ctx, ["good-one", "bad-one"], { definitions: defs, liveModules: new Set(["org"]) });
    expect(outcomes.map((o) => [o.code, o.status])).toEqual([["good-one", "ok"], ["bad-one", "error"]]);
    const bad = outcomes[1] as { message: string };
    expect(bad.message).toBe("This widget could not load.");
    expect(bad.message).not.toContain("db connection");
  });
  it("gives a slow widget a timeout and a plain message", async () => {
    const defs = [{ ...base, code: "slow-one", load: () => new Promise<never>(() => undefined) }];
    const outcomes = await runWidgets(pool, ctx, ["slow-one"], { definitions: defs, liveModules: new Set(["org"]), timeoutMs: 20 });
    expect(outcomes[0]).toMatchObject({ status: "timeout" });
  });
  it("drops an unknown code without an error", async () => {
    expect(await runWidgets(pool, ctx, ["no-such-widget"], { definitions: [base], liveModules: new Set(["org"]) })).toEqual([]);
  });
});
