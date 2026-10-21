// Parity comparison (Part 15 REQ-UXMIG-F08; A-139). Exact comparison for data and deterministic exports; semantic comparison (keys sorted,
// whitespace collapsed) for structured output. PDF and other formats that need a rendering check are not compared here and say so.
export interface ParityReport {
  match: boolean;
  differences: string[];
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value.replace(/\s+/g, " ").trim());
  return JSON.stringify(value);
}

export function compareSemantic(actual: unknown, golden: unknown): ParityReport {
  const a = canonical(actual);
  const g = canonical(golden);
  return a === g ? { match: true, differences: [] } : { match: false, differences: [`expected ${g}`, `received ${a}`] };
}

export function compareExact(actual: string, golden: string): ParityReport {
  if (actual === golden) return { match: true, differences: [] };
  const lines = Math.max(actual.split("\n").length, golden.split("\n").length);
  const differences: string[] = [];
  const a = actual.split("\n");
  const g = golden.split("\n");
  for (let i = 0; i < lines && differences.length < 10; i++) if (a[i] !== g[i]) differences.push(`line ${i + 1}: expected ${JSON.stringify(g[i])}, received ${JSON.stringify(a[i])}`);
  return { match: false, differences };
}

export type ExportFormat = "csv" | "json" | "xlsx" | "pdf";

/** Chooses the comparison for an export. PDF needs a rendering check that this harness does not do, so it is reported as not compared. */
export function exportComparison(format: ExportFormat): "exact" | "semantic" | "not_compared" {
  if (format === "csv" || format === "xlsx") return "exact";
  if (format === "json") return "semantic";
  return "not_compared";
}
