// Approver resolution (Part 16 REQ-WF-F05; CP-WF-01, CP-WF-02). A step is given to one person: someone with the role in scope, enough
// authority for the amount, and no enforced segregation-of-duties conflict on this document. Nobody qualifies: the step is not given and
// the item waits for an administrator. The system never approves on anyone's behalf.
import type { Pool } from "pg";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { limitFor } from "../iam/authority";
import { preventiveCheck } from "../iam/sod";

export interface Candidate {
  userRef: string;
  limitPaise: number | null;
  /** Enforced, uncovered segregation conflicts on this document. */
  conflicts: number;
}

export type Resolution = { kind: "resolved"; approver: string } | { kind: "unresolved"; reason: string };

/** Pure choice among candidates: the smallest authority that still covers the amount, then the name order, so the result is repeatable. */
export function resolveApprover(candidates: Candidate[], amountPaise: number, submitter: string): Resolution {
  const eligible = candidates
    .filter((c) => c.userRef !== submitter && c.conflicts === 0 && c.limitPaise !== null && amountPaise <= c.limitPaise)
    .sort((a, b) => (a.limitPaise! - b.limitPaise!) || a.userRef.localeCompare(b.userRef));
  if (eligible.length === 0) {
    return { kind: "unresolved", reason: "no one in the role has authority for this amount without a conflict; the item waits for an administrator" };
  }
  return { kind: "resolved", approver: eligible[0].userRef };
}

/** People who hold the role in an approved, current assignment. */
export async function candidatesForRole(pool: Pool, ctx: RequestContext, roleCode: string): Promise<string[]> {
  const { rows } = await withTransaction(
    pool,
    (client) =>
      client.query<{ user_ref: string }>(
        `SELECT DISTINCT a.user_ref FROM iam_user_role_assignments a JOIN iam_roles r ON r.id = a.role_id
          WHERE a.tenant_id = $1 AND r.role_code = $2 AND a.approval_status = 'approved'
            AND a.valid_from <= CURRENT_DATE AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)`,
        [ctx.tenantId, roleCode],
      ),
    { tenantId: ctx.tenantId },
  );
  return rows.map((r) => r.user_ref);
}

/** Resolves one step: finds the role holders, reads each one's limit and counts their conflicts on this document, then chooses. */
export async function resolveStep(
  pool: Pool,
  ctx: RequestContext,
  input: { roleCode: string; docType: string; projectId?: number | null; category?: string | null; amountPaise: number; submitter: string; entityId: string; at: string },
): Promise<Resolution> {
  const users = await candidatesForRole(pool, ctx, input.roleCode);
  const candidates: Candidate[] = [];
  for (const userRef of users) {
    const limit = await limitFor(pool, ctx, { userRef, docType: input.docType, projectId: input.projectId, category: input.category, at: input.at });
    const conflicts = await withTransaction(
      pool,
      async (client) => {
        const violations = await preventiveCheck(client, ctx.tenantId, userRef, "wf.approve", input.docType, input.entityId, input.projectId == null ? null : String(input.projectId));
        return violations.filter((v) => v.enforcement === "enforce" && !v.covered).length;
      },
      { tenantId: ctx.tenantId },
    );
    candidates.push({ userRef, limitPaise: limit, conflicts });
  }
  return resolveApprover(candidates, input.amountPaise, input.submitter);
}
