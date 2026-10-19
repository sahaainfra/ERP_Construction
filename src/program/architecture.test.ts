import { describe, expect, it } from "vitest";
import { boundaryViolations, localImports, normalise, unlistedDependencies } from "./architecture";

const known = new Set([
  "src/domain/kpi.ts",
  "src/domain/commercial.ts",
  "src/components/shell/AppShell.tsx",
  "src/design/icons.tsx",
  "src/design/navigation.ts",
  "src/program/index.ts",
  "src/app/page.tsx",
]);

describe("import boundaries (REQ-ARCH-F03)", () => {
  it("reports no violation for the allowed directions", () => {
    const edges = {
      "src/app/page.tsx": ["src/components/shell/AppShell.tsx"],
      "src/components/shell/AppShell.tsx": ["src/design/icons.tsx", "src/design/navigation.ts"],
      "src/domain/kpi.ts": [],
      "src/program/index.ts": [],
    };
    expect(boundaryViolations(edges)).toEqual([]);
  });

  it("fails a UI file that imports a domain formula", () => {
    const v = boundaryViolations({ "src/components/shell/AppShell.tsx": ["src/domain/kpi.ts"] });
    expect(v).toEqual([expect.objectContaining({ rule: "ui-computes-nothing", to: "src/domain/kpi.ts" })]);
  });

  it("fails a domain formula that imports the UI", () => {
    const v = boundaryViolations({ "src/domain/kpi.ts": ["src/design/icons.tsx"] });
    expect(v.map((x) => x.rule)).toEqual(["domain-is-pure"]);
  });

  it("fails a page that reaches a formula directly", () => {
    const v = boundaryViolations({ "src/app/page.tsx": ["src/domain/commercial.ts"] });
    expect(v.map((x) => x.rule)).toEqual(["pages-use-components-only"]);
  });

  it("catches a deliberately introduced cross-module import in the real graph shape", () => {
    // Mirrors the acceptance test in Part 02 §17: a new cross-module import must fail the build.
    const source = `import { spi } from "@/domain/kpi";\nexport function Bad() { return spi(1, 2); }`;
    const edges = { "src/components/shell/AppShell.tsx": localImports("src/components/shell/AppShell.tsx", source, known) };
    expect(boundaryViolations(edges)).toHaveLength(1);
  });
});

describe("import resolution", () => {
  it("resolves @/ and relative specifiers and ignores packages", () => {
    const source = `import Link from "next/link";\nimport { Icon } from "@/design/icons";\nimport { nav } from "../../design/navigation";`;
    expect(localImports("src/components/shell/AppShell.tsx", source, known)).toEqual([
      "src/design/icons.tsx",
      "src/design/navigation.ts",
    ]);
  });

  it("normalises parent segments", () => {
    expect(normalise("src/components/shell/../../design/icons.tsx")).toBe("src/design/icons.tsx");
    expect(normalise("src/a/b/../c.ts")).toBe("src/a/c.ts");
  });
});

describe("dependency allow-list (CP-ARCH-01)", () => {
  it("lists packages that are not on the allow-list", () => {
    const pkg = { dependencies: { next: "1", axios: "1" }, devDependencies: { vitest: "1" } };
    expect(unlistedDependencies(pkg, ["next", "vitest"])).toEqual(["axios"]);
  });

  it("passes when every declared package is listed", () => {
    expect(unlistedDependencies({ dependencies: { next: "1" } }, ["next"])).toEqual([]);
  });
});
