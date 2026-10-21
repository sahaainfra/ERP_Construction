// Decision tables (Part 16 REQ-WF-F03; A-153). A small evaluator written in the repository. A table has typed inputs and rows of
// conditions with outputs. Two checks run before a table can be saved or activated: a validity check, and a coverage check that finds
// inputs no rule covers (gaps) and inputs more than one unique rule covers (overlaps). No input is ever routed by a silent default.
import { AppError } from "../core/errors";

export type Scalar = string | number;
export type Condition = "any" | { eq: Scalar } | { in: Scalar[] } | { min?: number; max?: number };

export interface Row {
  conditions: Record<string, Condition>;
  outputs: Record<string, unknown>;
}

export interface Table {
  inputs: { name: string; type: "text" | "number" }[];
  hitPolicy: "unique" | "first";
  rows: Row[];
}

/** Largest number of combinations the coverage check will examine. Larger tables are reported, not guessed at. */
export const COVERAGE_LIMIT = 20000;

export function validateTable(table: Table): string[] {
  const problems: string[] = [];
  const types = new Map(table.inputs.map((i) => [i.name, i.type]));
  if (table.inputs.length === 0) problems.push("a table needs at least one input");
  if (!["unique", "first"].includes(table.hitPolicy)) problems.push(`unknown hit policy ${table.hitPolicy}`);
  table.rows.forEach((row, index) => {
    for (const [name, cond] of Object.entries(row.conditions)) {
      const type = types.get(name);
      if (!type) {
        problems.push(`row ${index + 1} uses unknown input ${name}`);
        continue;
      }
      if (cond === "any") continue;
      if ("eq" in cond || "in" in cond) {
        if (type !== "text") problems.push(`row ${index + 1}: ${name} is a number, so use min and max`);
      } else if (type !== "number") problems.push(`row ${index + 1}: ${name} is text, so use eq or in`);
      else if (cond.min !== undefined && cond.max !== undefined && cond.min >= cond.max) problems.push(`row ${index + 1}: ${name} has min at or above max`);
    }
    if (Object.keys(row.outputs).length === 0) problems.push(`row ${index + 1} has no outputs`);
  });
  return problems;
}

function matches(cond: Condition | undefined, value: Scalar | undefined): boolean {
  if (cond === undefined || cond === "any") return true;
  if (value === undefined) return false;
  if ("eq" in cond) return value === cond.eq;
  if ("in" in cond) return cond.in.includes(value);
  if (typeof value !== "number") return false;
  return (cond.min === undefined || value >= cond.min) && (cond.max === undefined || value < cond.max);
}

function rowMatches(row: Row, inputs: Record<string, Scalar | undefined>): boolean {
  return Object.entries(row.conditions).every(([name, cond]) => matches(cond, inputs[name]));
}

/** The outputs of the rule that applies. Refuses when no rule applies, or when a unique table matches more than one rule. */
export function evaluate(table: Table, inputs: Record<string, Scalar | undefined>): { rowIndex: number; outputs: Record<string, unknown> } {
  const hits = table.rows.map((row, index) => ({ row, index })).filter((h) => rowMatches(h.row, inputs));
  if (hits.length === 0) throw new AppError("VALIDATION_FAILED", "no decision rule applies to these inputs");
  if (table.hitPolicy === "unique" && hits.length > 1) throw new AppError("VALIDATION_FAILED", "more than one decision rule applies to these inputs");
  return { rowIndex: hits[0].index, outputs: hits[0].row.outputs };
}

export interface Coverage {
  gaps: Record<string, Scalar>[];
  overlaps: { rows: [number, number]; at: Record<string, Scalar> }[];
  checked: number;
}

/**
 * Looks for inputs with no rule and inputs with two unique rules. Numeric inputs are checked at each boundary and one unit below it,
 * which covers every interval a row can name. Text inputs are checked at each named value and at one value no row names.
 */
export function checkCoverage(table: Table): Coverage {
  const domains = table.inputs.map((input) => ({ name: input.name, points: domainPoints(table, input.name, input.type) }));
  const total = domains.reduce((n, d) => n * d.points.length, 1);
  if (total > COVERAGE_LIMIT) throw new AppError("VALIDATION_FAILED", `the table has ${total} input combinations, more than the ${COVERAGE_LIMIT} the coverage check examines; split it`);
  const gaps: Coverage["gaps"] = [];
  const overlaps: Coverage["overlaps"] = [];
  let checked = 0;
  const combo: Record<string, Scalar> = {};
  const walk = (i: number) => {
    if (i === domains.length) {
      checked++;
      const hits = table.rows.map((r, index) => ({ r, index })).filter((h) => rowMatches(h.r, combo));
      if (hits.length === 0 && gaps.length < 50) gaps.push({ ...combo });
      if (table.hitPolicy === "unique" && hits.length > 1 && overlaps.length < 50) overlaps.push({ rows: [hits[0].index, hits[1].index], at: { ...combo } });
      return;
    }
    for (const p of domains[i].points) {
      combo[domains[i].name] = p;
      walk(i + 1);
    }
  };
  walk(0);
  return { gaps, overlaps, checked };
}

function domainPoints(table: Table, name: string, type: "text" | "number"): Scalar[] {
  const conds = table.rows.map((r) => r.conditions[name]).filter((c): c is Exclude<Condition, "any"> => c !== undefined && c !== "any");
  if (type === "text") {
    const values = new Set<string>();
    for (const c of conds) {
      if ("eq" in c) values.add(String(c.eq));
      if ("in" in c) c.in.forEach((v) => values.add(String(v)));
    }
    return [...values, "__no_rule_names_this__"];
  }
  const bounds = new Set<number>();
  for (const c of conds) {
    if ("min" in c && c.min !== undefined) bounds.add(c.min);
    if ("max" in c && c.max !== undefined) bounds.add(c.max);
  }
  if (bounds.size === 0) return [0];
  const sorted = [...bounds].sort((a, b) => a - b);
  const points = new Set<number>([sorted[0] - 1]);
  for (const b of sorted) {
    points.add(b);
    points.add(b - 0.5);
  }
  return [...points].sort((a, b) => a - b);
}
