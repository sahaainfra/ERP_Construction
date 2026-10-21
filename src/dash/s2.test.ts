// Part 13 S2 pure tests: filter parsing and URL round trip, the designer's space checks, and the frame rule that omits empty sections.
import { describe, expect, it } from "vitest";
import { parseFilters, filtersToQuery, NO_FILTERS } from "./filters";
import { spaceProblems } from "./designer";
import { suppliedSections, SITE_SECTIONS } from "../design/ui/frames";
import type { WidgetDefinition } from "./types";
import { WIDGETS } from "./widgets";

describe("global filters (REQ-DASH-F05)", () => {
  it("reads valid filters and writes the same URL back", () => {
    const { filters, problems } = parseFilters({ project: "12", site: "40", period: "2026-10", wbs: "1.2-b" });
    expect(problems).toEqual([]);
    expect(filters).toEqual({ projectId: 12, siteId: 40, period: "2026-10", wbs: "1.2-b" });
    expect(filtersToQuery(filters)).toBe("?project=12&site=40&period=2026-10&wbs=1.2-b");
    expect(filtersToQuery(NO_FILTERS)).toBe("");
  });
  it("reports malformed values rather than guessing", () => {
    expect(parseFilters({ project: "12x" }).problems).toEqual([expect.objectContaining({ field: "project" })]);
    expect(parseFilters({ period: "2026-13" }).problems).toEqual([expect.objectContaining({ field: "period" })]);
    expect(parseFilters({ wbs: "1 2" }).problems).toEqual([expect.objectContaining({ field: "wbs" })]);
    expect(parseFilters({ site: "40" }).problems).toEqual([expect.objectContaining({ field: "site" })]);
  });
});

describe("designer checks (REQ-DASH-F04)", () => {
  it("accepts a registered, live list of widgets with a reason", () => {
    expect(spaceProblems("site_engineer", ["my-sign-ins", "my-projects-sites"], "Default space for site engineers")).toEqual([]);
  });
  it("refuses an unknown widget, a duplicate, a bad role code, an empty list and a short reason", () => {
    expect(spaceProblems("site_engineer", ["no-such"], "Default space for site engineers")).toEqual([expect.objectContaining({ field: "no-such" })]);
    expect(spaceProblems("site_engineer", ["my-sign-ins", "my-sign-ins"], "Default space for site engineers").map((p) => p.message).join()).toMatch(/twice/);
    expect(spaceProblems("Bad Role", ["my-sign-ins"], "Default space for site engineers")).toEqual([expect.objectContaining({ field: "roleCode" })]);
    expect(spaceProblems("site_engineer", [], "Default space for site engineers").map((p) => p.field)).toContain("widgetCodes");
    expect(spaceProblems("site_engineer", ["my-sign-ins"], "short")).toEqual([expect.objectContaining({ field: "reason" })]);
  });
  it("refuses a widget whose module is not live", () => {
    const hidden: WidgetDefinition = { ...WIDGETS[0], code: "future-widget", moduleCode: "plant" };
    expect(spaceProblems("site_engineer", ["future-widget"], "Default space for site engineers", [...WIDGETS, hidden]).map((p) => p.message).join()).toMatch(/not live/);
  });
});

describe("frames (REQ-DASH-F06)", () => {
  it("keeps only the sections a module supplied content for", () => {
    const kept = suppliedSections([
      { id: "plan", label: "Plan", content: "Milestones" },
      { id: "labour", label: "Labour", content: null },
      { id: "plant", label: "Plant", content: undefined },
    ]);
    expect(kept.map((s) => s.id)).toEqual(["plan"]);
  });
  it("lists the site sections in the order of the Part", () => {
    expect(SITE_SECTIONS).toEqual(["Plan", "Execute", "Labour", "Materials", "Plant", "Quality", "HSE", "DPR", "Tasks", "Documents", "Chat"]);
  });
});
