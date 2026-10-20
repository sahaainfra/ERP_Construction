// Field-level policy (Part 07 REQ-IAM-F09). Sensitive fields are removed or masked for viewers who lack the view permission.
// Applied in one place so that API payloads, exports and notifications use the same rules.
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { can } from "./pdp";
import type { Resource } from "./policy";

export function maskValue(value: unknown, mask: "full" | "partial" | "hash"): unknown {
  if (mask === "full") return undefined;
  const text = String(value);
  if (mask === "partial") return text.length <= 4 ? "*".repeat(text.length) : `${"*".repeat(text.length - 4)}${text.slice(-4)}`;
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** Returns a copy of the record with every field the viewer may not see masked. A "full" mask removes the key. */
export async function maskFields<T extends Record<string, unknown>>(pool: Pool, ctx: RequestContext, entityType: string, record: T, resource?: Resource): Promise<Partial<T>> {
  const policies = await withTransaction(
    pool,
    (client) => client.query<{ field_name: string; view_permission_key: string; mask_type: "full" | "partial" | "hash" }>(
      "SELECT field_name, view_permission_key, mask_type FROM iam_field_policies WHERE entity_type = $1", [entityType]),
    { tenantId: ctx.tenantId },
  );
  const out: Record<string, unknown> = { ...record };
  for (const policy of policies.rows) {
    if (!(policy.field_name in out)) continue;
    const allowed = (await can(pool, ctx, policy.view_permission_key, resource)).allowed;
    if (allowed) continue;
    const masked = maskValue(out[policy.field_name], policy.mask_type);
    if (masked === undefined) delete out[policy.field_name];
    else out[policy.field_name] = masked;
  }
  return out as Partial<T>;
}
