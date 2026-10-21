// Delegation of authority and cumulative evaluation (Part 16 REQ-WF-F04; A-148, A-149; DR-13). Limits themselves are kept and approved in
// iam_authority_limits (Part 07), and read here through limitFor. This module adds the cumulative check that stops one order being split
// into several smaller ones, and the finding (DR-13) raised when splitting would have changed the band.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";

/** Default window in days (A-149). The owner confirms it (discovery §2.6). */
export const SPLIT_WINDOW_DAYS = 7;

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export interface PriorAmount {
  docId: string;
  amountPaise: number;
  at: string;
}

/** The band a total falls in: the index of the first ceiling it does not exceed, or the count of ceilings when it exceeds them all. */
export function bandIndex(amountPaise: number, ceilingsPaise: number[]): number {
  const sorted = [...ceilingsPaise].sort((a, b) => a - b);
  const i = sorted.findIndex((c) => amountPaise <= c);
  return i === -1 ? sorted.length : i;
}

/** The total the document is routed on: its amount plus the same split key's amounts inside the window. */
export function cumulativeTotal(prior: PriorAmount[], current: { docId: string; amountPaise: number; at: string }, windowDays: number = SPLIT_WINDOW_DAYS): number {
  const end = Date.parse(current.at);
  const start = end - windowDays * 86_400_000;
  const inWindow = prior.filter((p) => p.docId !== current.docId && Date.parse(p.at) >= start && Date.parse(p.at) <= end);
  return current.amountPaise + inWindow.reduce((sum, p) => sum + p.amountPaise, 0);
}

/** DR-13: the document alone is in one band but the cumulative total is in a higher one. */
export function splitFinding(singlePaise: number, cumulativePaise: number, ceilingsPaise: number[]): { finding: boolean; singleBand: number; cumulativeBand: number } {
  const singleBand = bandIndex(singlePaise, ceilingsPaise);
  const cumulativeBand = bandIndex(cumulativePaise, ceilingsPaise);
  return { finding: cumulativeBand > singleBand, singleBand, cumulativeBand };
}

/** Earlier workflows with the same split key inside the window, read from the instances. */
export async function priorAmounts(pool: Pool, ctx: RequestContext, splitKey: string, at: string, windowDays: number = SPLIT_WINDOW_DAYS): Promise<PriorAmount[]> {
  const { rows } = await withTransaction(
    pool,
    (client) =>
      client.query<{ doc_id: string; amount_snapshot: string | null; submitted_at: Date }>(
        `SELECT doc_id, amount_snapshot, submitted_at FROM wf_instances
          WHERE tenant_id = $1 AND split_key = $2 AND amount_snapshot IS NOT NULL
            AND submitted_at BETWEEN ($3::timestamptz - make_interval(days => $4::int)) AND $3::timestamptz`,
        [ctx.tenantId, splitKey, at, windowDays],
      ),
    { tenantId: ctx.tenantId },
  );
  return rows.map((r) => ({ docId: r.doc_id, amountPaise: toPaise(Number(r.amount_snapshot)), at: r.submitted_at.toISOString() }));
}
