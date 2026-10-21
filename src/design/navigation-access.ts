// Server-side permission check for navigation (Part 12 A-76). Uses Part 07 `can()` for each permission key that a navigation entry
// names. Imported only by server code (layouts, route handlers, tests): it touches the database.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { can } from "../iam/pdp";

/** The subset of `keys` the user holds. Each check goes through the permission engine; nothing is cached across users. */
export async function permittedAmong(pool: Pool, ctx: RequestContext, keys: readonly string[]): Promise<Set<string>> {
  const granted = new Set<string>();
  for (const key of keys) {
    const decision = await can(pool, ctx, key);
    if (decision.allowed) granted.add(key);
  }
  return granted;
}
