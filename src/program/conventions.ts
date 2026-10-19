// Identifier conventions from Part 00 §1.3. These validators are the reference that CI enforces (Part 04).
// Event past-tense and table plural forms are checked by shape only; the owning reviewer checks the word.

const PATTERNS = {
  /** Part NN, or NNA for a lettered Part inserted after NN. */
  part: /^\d{2}[A-C]?$/,
  /** Module code: lower-case, unique (Annex C). */
  moduleCode: /^[a-z][a-z0-9]*$/,
  /** Feature flag: ff.<code>[.<feature>]. */
  featureFlag: /^ff\.[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)?$/,
  /** Requirement: REQ-<CODE>-F<nn>. */
  requirement: /^REQ-[A-Z][A-Z0-9]*-F\d{2,}$/,
  /** Control point: CP-<CODE>-<nn>. */
  controlPoint: /^CP-[A-Z][A-Z0-9]*-\d{2}$/,
  /** Detection rule: DR-<nn>. */
  detectionRule: /^DR-\d{2}$/,
  /** Permission: <code>.<feature>.<action>. */
  permission: /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/,
  /** Event: <code>.<entity>.<past_tense_verb>. Shape only. */
  event: /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*\.[a-z][a-z_]*$/,
  /** API: /api/v<major>/<code>/<resource>. */
  api: /^\/api\/v\d+\/[a-z][a-z0-9]*\/[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*$/,
  /** New table: snake_case, plural, module prefix. Plural checked by a trailing "s". */
  table: /^[a-z][a-z0-9]*_[a-z][a-z0-9_]*s$/,
} as const;

export type ConventionKind = keyof typeof PATTERNS;

export function isValid(kind: ConventionKind, value: string): boolean {
  return PATTERNS[kind].test(value);
}

/** Throws with the rule name if the value breaks its convention. */
export function assertValid(kind: ConventionKind, value: string): string {
  if (!isValid(kind, value)) throw new RangeError(`"${value}" does not match the ${kind} convention (Part 00 §1.3)`);
  return value;
}

/** Evidence root for a module: docs/erp-program/modules/<code>/ (Part 00 §1.3). */
export function evidenceRoot(moduleCode: string): string {
  assertValid("moduleCode", moduleCode);
  return `docs/erp-program/modules/${moduleCode}/`;
}
