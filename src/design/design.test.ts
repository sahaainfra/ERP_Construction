// Part 12 S1 pure tests: contrast, the literal rule (CP-DS-02), generated tokens, the pre-paint script, vendored fonts, and the
// branding contrast rules. Database tests are in design.integration.test.ts.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, luminance, parseHex } from "./contrast";
import { iconProblems, literalProblems } from "./literals";
import { COLOUR_TOKENS, THEMES } from "./tokens";
import { PRE_PAINT_SCRIPT } from "./preferences";
import { brandContrast, brandProblems, brandingCss } from "./branding";

const ROOT = join(__dirname, "../..");

describe("contrast (DS-7)", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });
  it("refuses a value that is not a six-digit hex colour", () => {
    expect(parseHex("#abc")).toBeNull();
    expect(() => luminance("blue")).toThrow(RangeError);
  });
});

describe("literal lint (REQ-DS-F01, CP-DS-02)", () => {
  it("flags a colour literal in module code and passes token-driven code", () => {
    expect(literalProblems("src/components/x.tsx", 'const c = "#1D5BA6";')).toHaveLength(1);
    expect(literalProblems("src/components/x.tsx", "style={{ color: 'rgb(1, 2, 3)' }}")).toHaveLength(1);
    expect(literalProblems("src/components/x.tsx", 'style={{ color: "var(--erp-color-text-primary)" }}')).toEqual([]);
  });
  it("exempts the token package and tests", () => {
    expect(literalProblems("src/design/tokens.ts", 'export const X = "#FFFFFF";')).toEqual([]);
    expect(literalProblems("src/design/contrast.test.ts", 'const c = "#000000";')).toEqual([]);
  });
  it("flags an icon imported from the library or by file, and passes an icon from the registry", () => {
    expect(iconProblems("src/components/x.tsx", 'import { Home } from "lucide-react";')).toHaveLength(1);
    expect(iconProblems("src/components/x.tsx", 'import logo from "./logo.svg";')).toHaveLength(1);
    expect(iconProblems("src/components/x.tsx", 'import { Icon } from "@/design/icons";')).toEqual([]);
    expect(iconProblems("src/design/icons.tsx", 'import { Home } from "lucide-react";')).toEqual([]);
  });
  it("finds no colour literal and no direct icon import anywhere in the module tree", () => {
    const problems: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|css)$/.test(name)) {
          const rel = relative(ROOT, path).replace(/\\/g, "/");
          const text = readFileSync(path, "utf8");
          problems.push(...literalProblems(rel, text), ...iconProblems(rel, text));
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(problems).toEqual([]);
  });
});

describe("generated tokens (DS-4)", () => {
  it("exposes the themes and the brand, text and surface tokens the branding check uses", () => {
    expect(THEMES).toEqual(["light", "dark", "high-contrast"]);
    expect(COLOUR_TOKENS["brand-primary"].light).toMatch(/^#[0-9A-F]{6}$/);
    expect(COLOUR_TOKENS["text-on-primary"].light).toBe("#FFFFFF");
    expect(COLOUR_TOKENS["bg-surface"].light).toBe("#FFFFFF");
  });
});

describe("pre-paint script (DS-9)", () => {
  it("is valid script and applies only known values", () => {
    expect(() => new Function(PRE_PAINT_SCRIPT)).not.toThrow();
    expect(PRE_PAINT_SCRIPT).toContain('["light","dark","high-contrast"]');
    expect(PRE_PAINT_SCRIPT).toContain('["compact","cozy","touch"]');
  });
});

describe("vendored fonts (REQ-DS-F02, A-74)", () => {
  it("every font file named in fonts.css is in the repository with its licence", () => {
    const css = readFileSync(join(ROOT, "src/design/fonts.css"), "utf8");
    const files = [...css.matchAll(/url\("\/(fonts\/[^"]+)"\)/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) expect(existsSync(join(ROOT, "public", file)), file).toBe(true);
    for (const family of ["ibm-plex-sans", "ibm-plex-mono", "noto-sans-devanagari"]) {
      expect(readFileSync(join(ROOT, "public/fonts", family, "OFL.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE");
    }
  });
  it("sends no font request to a third party from the application", () => {
    const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
    expect(layout).not.toContain("next/font/google");
    expect(readFileSync(join(ROOT, "src/design/fonts.css"), "utf8")).not.toContain("fonts.googleapis.com");
  });
});

describe("brand contrast (REQ-DS-F11, A-77, A-83)", () => {
  it("passes a brand that meets the rules and refuses one that does not", () => {
    expect(brandContrast("#1D5BA6", "#8A5A00").pass).toBe(true);
    const failing = brandContrast("#F3F5F7", "#FFFFFF");
    expect(failing.pass).toBe(false);
    expect(failing.checks.filter((c) => !c.pass).map((c) => c.id)).toEqual(["text-on-primary", "accent-text-on-surface", "primary-ui-on-surface"]);
  });
  it("checks the light theme only, as A-83 records", () => {
    expect(brandContrast("#1D5BA6", "#8A5A00").checks.every((c) => c.theme === "light")).toBe(true);
  });
  it("refuses a malformed colour or a missing reason before any check", () => {
    expect(brandProblems({ primary: "blue", accent: "#8A5A00", reason: "Brand from the client letter" })).toEqual([expect.objectContaining({ field: "primary" })]);
    expect(brandProblems({ primary: "#1D5BA6", accent: "#8A5A00", reason: "short" })).toEqual([expect.objectContaining({ field: "reason" })]);
    expect(brandProblems({ primary: "#1D5BA6", accent: "#8A5A00", logoRef: "../etc", reason: "Brand from the client letter" })).toEqual([expect.objectContaining({ field: "logoRef" })]);
  });
  it("overrides only the two brand tokens", () => {
    const css = brandingCss({ primary: "#1D5BA6", accent: "#8A5A00" });
    expect(css).toContain("--erp-color-brand-primary: #1D5BA6;");
    expect(css).toContain("--erp-color-brand-accent: #8A5A00;");
    expect(css.match(/--erp-/g)).toHaveLength(2);
  });
});
