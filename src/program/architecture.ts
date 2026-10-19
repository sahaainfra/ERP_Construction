// Architecture conformance checks (Part 02 REQ-ARCH-F03; CP-ARCH-01 and CP-ARCH-02). Pure functions: the CLI reads
// the files and passes the import edges and the dependency list in.

export interface BoundaryRule {
  id: string;
  /** Files matching `from` must not import files matching `forbid`. */
  from: RegExp;
  forbid: RegExp;
  reason: string;
}

export const BOUNDARY_RULES: readonly BoundaryRule[] = [
  {
    id: "domain-is-pure",
    from: /^src\/domain\//,
    forbid: /^src\/(app|components|design|program)\//,
    reason: "Domain formulas are pure: no UI and no programme code (Part 02 REQ-ARCH-F03)",
  },
  {
    id: "ui-computes-nothing",
    from: /^src\/(components|design)\//,
    forbid: /^src\/(domain|program)\//,
    reason: "UI does not compute business values or read programme data (N9, AC-1)",
  },
  {
    id: "programme-independent-of-ui",
    from: /^src\/program\//,
    forbid: /^src\/(app|components|design)\//,
    reason: "Programme governance does not depend on the UI",
  },
  {
    id: "pages-use-components-only",
    from: /^src\/app\//,
    forbid: /^src\/(domain|program)\//,
    reason: "Pages reach business logic through module services (Part 05 onward), not formulas directly (N9)",
  },
];

export interface Violation {
  rule: string;
  from: string;
  to: string;
  reason: string;
}

/** Applies the boundary rules to a map of file → local files it imports. */
export function boundaryViolations(edges: Readonly<Record<string, readonly string[]>>, rules = BOUNDARY_RULES): Violation[] {
  const found: Violation[] = [];
  for (const [from, targets] of Object.entries(edges)) {
    for (const to of targets) {
      for (const rule of rules) {
        if (rule.from.test(from) && rule.forbid.test(to)) {
          found.push({ rule: rule.id, from, to, reason: rule.reason });
        }
      }
    }
  }
  return found.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/**
 * Resolves the local imports of one file. `@/` maps to `src/`; relative paths resolve against the file.
 * Package imports are ignored. `known` lists every source file path so only real files are returned.
 */
export function localImports(file: string, source: string, known: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2];
    const target = resolveSpecifier(file, spec, known);
    if (target && target !== file) out.add(target);
  }
  return [...out].sort();
}

function resolveSpecifier(file: string, spec: string, known: ReadonlySet<string>): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = normalise([...file.split("/").slice(0, -1), ...spec.split("/")].join("/"));
  else return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}/index.ts`, `${base}/index.tsx`];
  return candidates.find((c) => known.has(c)) ?? null;
}

/** Collapses "." and ".." segments in a repository path. */
export function normalise(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Dependencies in package.json that the allow-list does not name (CP-ARCH-01). */
export function unlistedDependencies(
  packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
  allowlist: readonly string[],
): string[] {
  const declared = [...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {})];
  return declared.filter((name) => !allowlist.includes(name)).sort();
}
