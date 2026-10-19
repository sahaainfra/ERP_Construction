// Service hook contract (Part 05 REQ-CORE-F02; CP-CORE-01). A controlled service method declares the stages it runs.
// Registration refuses a declaration that skips authorisation or the protocol check, so the guarantee is checked at start-up
// and in tests, not left to convention. Parts 07 and 17 replace the stage implementations behind these names.
export const HOOK_STAGES = [
  "authorize",
  "validate",
  "calculate",
  "protocol.check",
  "persist",
  "audit",
  "ledger",
  "emit",
  "notify",
  "attach",
  "nextNumber",
] as const;
export type HookStage = (typeof HOOK_STAGES)[number];

export interface ControlledDeclaration {
  /** Lower-case dotted name, for example "core.sample.create". */
  name: string;
  /** What starts the method, for example "api.post" or "job.run". */
  trigger: string;
  stages: readonly HookStage[];
}

/** Returns the reasons a declaration is not acceptable. An empty list means it is acceptable. */
export function validateControlled(decl: ControlledDeclaration): string[] {
  const problems: string[] = [];
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(decl.name)) problems.push(`${decl.name}: name must be lower-case dotted text`);
  if (decl.trigger.trim() === "") problems.push(`${decl.name}: a trigger is required`);
  const unknown = decl.stages.filter((s) => !(HOOK_STAGES as readonly string[]).includes(s));
  if (unknown.length > 0) problems.push(`${decl.name}: unknown stage ${unknown.join(", ")}`);
  if (new Set(decl.stages).size !== decl.stages.length) problems.push(`${decl.name}: a stage appears twice`);
  for (const required of ["authorize", "protocol.check", "persist"] as const) {
    if (!decl.stages.includes(required)) problems.push(`${decl.name}: missing required stage ${required}`);
  }
  const at = (s: HookStage) => decl.stages.indexOf(s);
  if (at("authorize") >= 0 && at("persist") >= 0 && at("authorize") > at("persist")) problems.push(`${decl.name}: authorize must run before persist`);
  if (at("protocol.check") >= 0 && at("persist") >= 0 && at("protocol.check") > at("persist")) problems.push(`${decl.name}: protocol.check must run before persist`);
  return problems;
}

const registry = new Map<string, ControlledDeclaration>();

/** Registers a controlled method. Throws on an unacceptable or duplicate declaration. */
export function declareControlled(decl: ControlledDeclaration): void {
  const problems = validateControlled(decl);
  if (problems.length > 0) throw new RangeError(problems.join("; "));
  if (registry.has(decl.name)) throw new RangeError(`${decl.name} is already declared`);
  registry.set(decl.name, decl);
}

/** Declares a controlled method and returns it unchanged. */
export function controlled<F extends (...args: never[]) => unknown>(decl: ControlledDeclaration, fn: F): F {
  declareControlled(decl);
  return fn;
}

export function controlledMethods(): ControlledDeclaration[] {
  return [...registry.values()].sort((a, b) => a.name.localeCompare(b.name));
}
