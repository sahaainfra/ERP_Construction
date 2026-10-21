// Duplicate-component report (Part 15 REQ-UXMIG-F04; A-142). Uses the TypeScript compiler API already in the project (no new package).
// A component declared outside the design library, with the same name as a library component, is a local variant. It is reported with
// the library component it should be replaced by.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

export interface DuplicateVariant {
  file: string;
  name: string;
  libraryFile: string;
}

/** Names of the function components exported by library files. */
export function libraryComponents(libraryDir: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const file of listTsx(libraryDir)) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of sf.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && /^[A-Z]/.test(statement.name.text) && hasExport(statement)) {
        names.set(statement.name.text, relative(process.cwd(), file).split(sep).join("/"));
      }
    }
  }
  return names;
}

function hasExport(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
}

export function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTsx(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Finds the local copies in a set of source files, given the library's component names. */
export function findVariants(files: string[], library: Map<string, string>): DuplicateVariant[] {
  const found: DuplicateVariant[] = [];
  for (const file of files) {
    const rel = relative(process.cwd(), file).split(sep).join("/");
    if ([...library.values()].includes(rel)) continue;
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of sf.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && library.has(statement.name.text)) {
        found.push({ file: rel, name: statement.name.text, libraryFile: library.get(statement.name.text)! });
      }
    }
  }
  return found;
}

export function variantsPerFile(variants: DuplicateVariant[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of variants) counts[v.file] = (counts[v.file] ?? 0) + 1;
  return counts;
}
