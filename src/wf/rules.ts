// Workflow rules that need no session (Part 16 §6; CP-WF-01, CP-WF-05 input). The authority and acting-identity checks wait for the
// session layer (A-87) and the authority matrix (S2).
import { AppError } from "../core/errors";

/** Nobody approves a document they submitted (CP-WF-01). */
export function assertNotSelfApproval(actor: string, submittedBy: string): void {
  if (actor === submittedBy) throw new AppError("FORBIDDEN", "the person who submitted a document cannot approve it");
}

/** The amount stored at submission (A-148). Later edits to the document never change it. Returns null when no amount applies. */
export function takeAmountSnapshot(amount: number | undefined): string | null {
  if (amount === undefined) return null;
  if (!Number.isFinite(amount) || amount < 0) throw new AppError("VALIDATION_FAILED", "the amount must be a number of zero or more", [{ field: "amount", message: "invalid" }]);
  return amount.toFixed(2);
}

/** Routing reads only the stored snapshot. A workflow without one cannot route by amount. */
export function routingAmount(snapshot: string | null): number {
  if (snapshot === null) throw new AppError("VALIDATION_FAILED", "this workflow has no amount snapshot, so amount routing cannot run");
  return Number(snapshot);
}

/** A reason is required for rejection, return and cancellation: a code and a comment of at least ten characters. */
export function assertReason(action: string, reasonCode: string | undefined, comment: string | undefined): void {
  if (!["reject", "return", "cancel"].includes(action)) return;
  if (!reasonCode || !comment || comment.trim().length < 10) {
    throw new AppError("VALIDATION_FAILED", "a reason code and a comment of at least 10 characters are required for this action", [{ field: "comment", message: "required" }]);
  }
}
