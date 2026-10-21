// Simulation (Part 16 REQ-WF-F11; A-154). Reruns routing over recent documents with a candidate table and lists every document whose route
// would change. It reads stored snapshots and never re-runs side effects.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";

export interface SimDocument {
  docId: string;
  inputs: Record<string, string | number | undefined>;
  amount: number;
}

export interface SimDifference {
  docId: string;
  before: string[];
  after: string[];
}

export interface SimResult {
  total: number;
  changed: SimDifference[];
}

export function simulate(docs: SimDocument[], routeBefore: (d: SimDocument) => string[], routeAfter: (d: SimDocument) => string[]): SimResult {
  const changed: SimDifference[] = [];
  for (const d of docs) {
    const before = routeBefore(d);
    const after = routeAfter(d);
    if (before.join("|") !== after.join("|")) changed.push({ docId: d.docId, before, after });
  }
  return { total: docs.length, changed };
}

/** Stored snapshots of documents of one type submitted since a date. Only what the instance stored is returned. */
export async function loadSnapshots(pool: Pool, ctx: RequestContext, docType: string, sinceIso: string): Promise<SimDocument[]> {
  const { rows } = await withTransaction(
    pool,
    (client) =>
      client.query<{ doc_id: string; context_json: Record<string, string | number>; amount_snapshot: string | null }>(
        "SELECT doc_id, context_json, amount_snapshot FROM wf_instances WHERE tenant_id = $1 AND doc_type = $2 AND submitted_at >= $3::timestamptz ORDER BY id",
        [ctx.tenantId, docType, sinceIso],
      ),
    { tenantId: ctx.tenantId },
  );
  return rows.map((r) => ({ docId: r.doc_id, inputs: r.context_json, amount: Number(r.amount_snapshot ?? 0) }));
}
