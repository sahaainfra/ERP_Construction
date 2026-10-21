// Part 13 S4 pure tests: the drill conformance rule (CP-DASH-03), drill resolution, and the hierarchy breadcrumb.
import { describe, expect, it } from "vitest";
import { DRILL_REGISTRY, DRILL_TARGETS, drillConformanceProblems, resolveDrill, breadcrumbs } from "./drill";
import { WIDGETS } from "./widgets";

describe("drill registry (REQ-DASH-F11, CP-DASH-03)", () => {
  it("every widget's figure has a drill entry that reaches a registered target", () => {
    expect(drillConformanceProblems()).toEqual([]);
    for (const w of WIDGETS) expect(DRILL_REGISTRY.some((e) => e.metricCode === w.metricCode), w.code).toBe(true);
  });
  it("flags a figure whose drill entry is missing", () => {
    const without = DRILL_REGISTRY.filter((e) => e.metricCode !== "org.allocations.active");
    expect(drillConformanceProblems(without).join(" ")).toMatch(/has no drill entry/);
  });
  it("flags a drill route that is not a registered target", () => {
    const bad = DRILL_REGISTRY.map((e) => (e.metricCode === "secgov.events.open" ? { ...e, routeTemplate: "/anywhere" as never } : e));
    expect(drillConformanceProblems(bad).join(" ")).toMatch(/not a registered target/);
  });
  it("fills a route with its dimensions, and refuses a missing or unsafe one", () => {
    const entry = { metricCode: "x.site.count", dimensions: ["project", "site"], routeTemplate: "/projects/{project}/sites/{site}" as const };
    expect(resolveDrill("x.site.count", { project: "204", site: "20" }, [entry])).toEqual({ route: "/projects/204/sites/20" });
    expect(resolveDrill("x.site.count", { project: "204" }, [entry])).toEqual({ error: "a site is needed to open this figure" });
    expect(resolveDrill("x.site.count", { project: "204", site: "2/0" }, [entry])).toEqual({ error: "a site is needed to open this figure" });
    expect(resolveDrill("unknown.metric", {}, [entry])).toEqual({ error: "this figure has no drill path" });
  });
  it("lists the registered targets", () => {
    expect(DRILL_TARGETS).toContain("/projects/{project}/sites/{site}");
  });
});

describe("hierarchy breadcrumb (REQ-DASH-F12)", () => {
  it("links the built levels and shows the rest as text", () => {
    const crumbs = breadcrumbs({ company: "Acme", project: { id: "204", code: "P-204" }, site: { id: "20", code: "S-20" }, wbs: "1.2", activity: "A-55" });
    expect(crumbs).toEqual([
      { label: "Acme", route: null, built: false },
      { label: "P-204", route: "/projects/204", built: true },
      { label: "S-20", route: "/projects/204/sites/20", built: true },
      { label: "1.2", route: null, built: false },
      { label: "A-55", route: null, built: false },
    ]);
  });
  it("does not show a site without its project", () => {
    expect(breadcrumbs({ site: { id: "20", code: "S-20" } })).toEqual([]);
  });
});
