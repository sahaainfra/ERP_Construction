// Delegation (Part 16 REQ-WF-F07; A-156). A person may hand their approvals to one other person for a period, and only one hop is allowed.
// A delegate acts "on behalf of" the delegator, so the action log records both. Each action is checked again: the delegator's limit must
// cover the amount and the delegate must have no enforced segregation conflict on the document.
import type { PoolClient } from "pg";
import { AppError } from "../core/errors";
import { limitForClient } from "../iam/authority";
import { preventiveCheck } from "../iam/sod";

export interface DelegationInput {
  delegator: string;
  delegate: string;
  docType: string | null;
  validFrom: string;
  validTo: string;
  reason: string;
}

export function checkDelegationInput(input: DelegationInput): void {
  if (input.delegator === input.delegate) throw new AppError("VALIDATION_FAILED", "a person cannot delegate to themselves");
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short", [{ field: "reason", message: "at least 10 characters" }]);
  if (Date.parse(input.validTo) <= Date.parse(input.validFrom)) throw new AppError("VALIDATION_FAILED", "the end must be after the start");
}

/** The delegation in force for this delegate and document type at the given time, if any. Returns the delegator it acts for. */
export async function activeDelegator(client: PoolClient, tenantId: string, delegate: string, docType: string, at: Date): Promise<string | null> {
  const { rows } = await client.query<{ delegator: string }>(
    `SELECT delegator FROM wf_delegations
      WHERE tenant_id = $1 AND delegate = $2 AND (doc_type IS NULL OR doc_type = $3)
        AND revoked_at IS NULL AND valid_from <= $4 AND valid_to > $4
      ORDER BY id LIMIT 1`,
    [tenantId, delegate, docType, at.toISOString()],
  );
  return rows[0]?.delegator ?? null;
}

/** Checks that a delegated action is allowed now: the delegator's limit covers the amount and the delegate has no enforced conflict. */
export async function assertDelegatedAction(
  client: PoolClient,
  tenantId: string,
  input: { delegator: string; delegate: string; docType: string; docId: string; amountPaise: number | null; at: Date },
): Promise<void> {
  const limit = await limitForClient(client, tenantId, { userRef: input.delegator, docType: input.docType, at: input.at.toISOString().slice(0, 10) });
  if (input.amountPaise !== null && (limit === null || input.amountPaise > limit)) {
    throw new AppError("FORBIDDEN", "the delegator's authority does not cover this amount");
  }
  const violations = await preventiveCheck(client, tenantId, input.delegate, "wf.approve", input.docType, input.docId, null);
  if (violations.some((v) => v.enforcement === "enforce" && !v.covered)) throw new AppError("FORBIDDEN", "the delegate has a segregation conflict on this document");
}
