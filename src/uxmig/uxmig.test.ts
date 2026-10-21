// Part 15 S1 tests: classification rules, route and module names, the scanner, the duplicate report, the tracker, feature flags, the route
// registry (no 404 for a known legacy route), the parity comparisons, and the golden check on the current home route.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classify, REFACTOR_COMPONENT_LIMIT, type ScreenFacts } from "./classify";
import { factsFor, moduleFor, routeFor, scanScreens } from "./scan";
import { findVariants, libraryComponents, listTsx, variantsPerFile } from "./duplicates";
import { advance, STAGES, trackerCsv, type TrackerRow } from "./tracker";
import { flagKey, flagOn } from "./flags";
import { checkMappings, resolveRoute, type RouteMapping } from "./redirects";
import { compareExact, compareSemantic, exportComparison } from "./parity";

const base: ScreenFacts = { route: "/projects", module: "projects", file: "src/app/projects/page.tsx", localComponents: [], literalCount: 0, template: "ListReport", duplicateVariants: 0 };

describe("classification (REQ-UXMIG-F01)", () => {
  it("verifies a template screen with no literals or local copies", () => {
    expect(classify(base)).toBe("verify_only");
  });
  it("restyles a template screen that still has literals or local copies", () => {
    expect(classify({ ...base, literalCount: 2 })).toBe("restyle");
    expect(classify({ ...base, duplicateVariants: 1 })).toBe("restyle");
  });
  it("refactors a screen without a template when it has few local components, and rebuilds one with many", () => {
    const few = { ...base, template: null, localComponents: Array.from({ length: REFACTOR_COMPONENT_LIMIT }, (_, i) => `C${i}`) };
    expect(classify(few)).toBe("refactor_to_template");
    expect(classify({ ...few, localComponents: [...few.localComponents, "Extra"] })).toBe("rebuild");
  });
});

describe("route and module names", () => {
  const app = "/src/app";
  it("names the route from its folder, skipping route groups, and keeps dynamic segments", () => {
    expect(routeFor(app, "/src/app/page.tsx")).toBe("/");
    expect(routeFor(app, "/src/app/(shell)/projects/[id]/page.tsx")).toBe("/projects/[id]");
  });
  it("takes the module from the first segment, and home for the root", () => {
    expect(moduleFor("/")).toBe("home");
    expect(moduleFor("/Procurement/rfq")).toBe("procurement");
  });
});

describe("scanner (REQ-UXMIG-F01)", () => {
  it("reads templates, literals and local components from page source", () => {
    const dir = mkdtempSync(join(tmpdir(), "uxmig-"));
    mkdirSync(join(dir, "dpr"), { recursive: true });
    writeFileSync(join(dir, "dpr/page.tsx"), `import { ListReport } from "../../design/ui/templates";\nconst c = "#ff0000";\nexport default function Page() { return null; }\nfunction Row() { return null; }\n`);
    const [screen] = scanScreens(dir);
    expect(screen).toMatchObject({ route: "/dpr", module: "dpr", template: "ListReport", literalCount: 1, localComponents: ["Page", "Row"], classification: "restyle" });
    expect(factsFor(dir, join(dir, "dpr/page.tsx")).template).toBe("ListReport");
  });
});

describe("duplicate report (REQ-UXMIG-F04, A-142)", () => {
  it("reports a local copy of a library component, and not the library file itself", () => {
    const dir = mkdtempSync(join(tmpdir(), "uxmig-dup-"));
    mkdirSync(join(dir, "ui"), { recursive: true });
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(join(dir, "ui/core.tsx"), `export function Banner() { return null; }\n`);
    writeFileSync(join(dir, "app/page.tsx"), `function Banner() { return null; }\nexport default function P() { return null; }\n`);
    const library = libraryComponents(join(dir, "ui"));
    const variants = findVariants(listTsx(dir), library);
    expect(variants.map((v) => v.name)).toEqual(["Banner"]);
    expect(variants[0].file.endsWith("app/page.tsx")).toBe(true);
    expect(variantsPerFile(variants)[variants[0].file]).toBe(1);
  });
});

describe("tracker (REQ-UXMIG-F13, A-141)", () => {
  const row: TrackerRow = { route: "/dpr", module: "dpr", classification: "restyle", stage: "inventoried", parityRef: "" };
  it("moves one stage at a time and never skips parity", () => {
    expect(advance(row, "planned").stage).toBe("planned");
    expect(() => advance(row, "piloted")).toThrow(RangeError);
    expect(() => advance({ ...row, stage: "in_progress" }, "parity_proven")).toThrow(/parity report/);
    expect(STAGES.length).toBe(7);
  });
  it("writes a CSV that escapes commas and quotes", () => {
    const csv = trackerCsv([{ ...row, classification: 'a,"b"' }]);
    expect(csv.split("\n")[0]).toBe("route,module,classification,stage,parity_ref");
    expect(csv).toContain('"a,""b"""');
  });
});

describe("feature flags (REQ-UXMIG-F09, A-138)", () => {
  it("is off unless configured on, and the key uses the module code", () => {
    expect(flagKey("dpr")).toBe("ff.uxmig.dpr");
    expect(flagOn("dpr")).toBe(false);
    expect(flagOn("dpr", { "ff.uxmig.dpr": true })).toBe(true);
    expect(() => flagKey("DPR!")).toThrow(RangeError);
  });
});

describe("route registry (REQ-UXMIG-F09, A-140)", () => {
  const mappings: RouteMapping[] = [{ legacy: "/old-dpr", next: "/dpr", module: "dpr" }];
  it("serves the legacy route while its flag is off, and redirects once it is on, never a 404", () => {
    expect(resolveRoute("/old-dpr", mappings, {})).toEqual({ kind: "serve", path: "/old-dpr" });
    expect(resolveRoute("/old-dpr", mappings, { "ff.uxmig.dpr": true })).toEqual({ kind: "redirect", to: "/dpr" });
    expect(resolveRoute("/unknown", mappings, {})).toEqual({ kind: "serve", path: "/unknown" });
  });
  it("finds duplicates, unknown targets and self-redirects before the registry is used", () => {
    expect(checkMappings([...mappings, mappings[0]], ["/dpr"])).toEqual(["duplicate legacy route /old-dpr"]);
    expect(checkMappings(mappings, [])).toEqual(["target /dpr for /old-dpr is not a known route"]);
    expect(checkMappings([{ legacy: "/a", next: "/a", module: "a" }], ["/a"])).toEqual(["/a redirects to itself"]);
  });
});

describe("parity (REQ-UXMIG-F08, A-139)", () => {
  it("compares exports exactly and reports the first differing lines", () => {
    expect(compareExact("a\nb", "a\nb").match).toBe(true);
    expect(compareExact("a\nX", "a\nb").differences[0]).toContain("line 2");
  });
  it("compares structured output semantically, ignoring key order and spacing", () => {
    expect(compareSemantic({ b: 1, a: "x  y" }, { a: "x y", b: 1 }).match).toBe(true);
    expect(compareSemantic({ a: 1 }, { a: 2 }).match).toBe(false);
  });
  it("says PDF is not compared rather than passing it", () => {
    expect(exportComparison("csv")).toBe("exact");
    expect(exportComparison("json")).toBe("semantic");
    expect(exportComparison("pdf")).toBe("not_compared");
  });
});

describe("golden check on the current home route (parity harness on /)", () => {
  it("the home route's facts match the golden record", () => {
    const [home] = scanScreens(join(process.cwd(), "src/app"));
    const golden = JSON.parse(readFileSync(join(process.cwd(), "src/uxmig/golden/home.json"), "utf8"));
    expect(compareSemantic(home, golden).differences).toEqual([]);
    expect(home.classification).toBe(classify(home));
  });
});
