// Screen scanner (Part 15 REQ-UXMIG-F01). Reads the App Router pages under a directory and records the facts that classify.ts uses.
// It reads source text only; it does not run the application.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { classify, type Classification, type ScreenFacts } from "./classify";

const TEMPLATE_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*design\/ui\/templates["']/;
const TEMPLATES = ["Launchpad", "ListReport", "ObjectPage", "Wizard", "SettingsPage", "PublicAuthPage", "Worklist", "Overview", "MobileCapture"];
const LOCAL_COMPONENT = /^\s*(?:export\s+(?:default\s+)?)?function\s+([A-Z][A-Za-z0-9]*)\s*\(/gm;
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\bfont-size\s*:\s*\d|\bpx\b/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name === "page.tsx") out.push(full);
  }
  return out;
}

/** The route a page serves, from its folder: `src/app/projects/[id]/page.tsx` becomes `/projects/[id]`. */
export function routeFor(appDir: string, pageFile: string): string {
  const folder = relative(appDir, pageFile).split(sep).slice(0, -1).filter((s) => !s.startsWith("(")).join("/");
  return `/${folder}`.replace(/\/$/, "") || "/";
}

/** The module a route belongs to: its first segment, or `home` for the root. */
export function moduleFor(route: string): string {
  const first = route.split("/").filter(Boolean)[0];
  return first ? first.toLowerCase().replace(/[^a-z0-9]/g, "") : "home";
}

export function factsFor(appDir: string, pageFile: string, duplicateVariants = 0): ScreenFacts {
  const source = readFileSync(pageFile, "utf8");
  const route = routeFor(appDir, pageFile);
  const imported = (TEMPLATE_IMPORT.exec(source)?.[1] ?? "").split(",").map((n) => n.trim());
  const template = TEMPLATES.find((t) => imported.includes(t)) ?? null;
  const localComponents = [...source.matchAll(LOCAL_COMPONENT)].map((m) => m[1]);
  const literalCount = (source.match(LITERAL) ?? []).length;
  return { route, module: moduleFor(route), file: relative(process.cwd(), pageFile).split(sep).join("/"), localComponents, literalCount, template, duplicateVariants };
}

export interface ScannedScreen extends ScreenFacts {
  classification: Classification;
}

export function scanScreens(appDir: string, duplicatesByFile: Record<string, number> = {}): ScannedScreen[] {
  return walk(appDir).map((page) => {
    const facts = factsFor(appDir, page, duplicatesByFile[relative(process.cwd(), page).split(sep).join("/")] ?? 0);
    return { ...facts, classification: classify(facts) };
  });
}
