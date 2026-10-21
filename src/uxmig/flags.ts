// Feature flags for migrated screens (Part 15 REQ-UXMIG-F09; A-138). Flags default to off. Server storage and audit wait for the session
// layer; until then this is the one configuration point, and no client value decides access.
export const FLAG_PREFIX = "ff.uxmig.";

const MODULE = /^[a-z][a-z0-9]{1,11}$/;

export function flagKey(module: string): string {
  if (!MODULE.test(module)) throw new RangeError(`"${module}" is not a valid module code`);
  return `${FLAG_PREFIX}${module}`;
}

/** Off unless the configuration turns it on for this module. */
export function flagOn(module: string, configuration: Record<string, boolean> = {}): boolean {
  return configuration[flagKey(module)] === true;
}
