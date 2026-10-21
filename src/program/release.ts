// Release state machine and approval rule (Part 04 §6 and REQ-CICD-F10; CP-CICD-03).

import { canTransition, transition, type Machine } from "../db/state-machines";

export const RELEASE_MACHINE = {
  name: "release",
  initial: "DRAFT",
  transitions: {
    DRAFT: ["CANDIDATE"],
    CANDIDATE: ["STAGING_VERIFIED"],
    STAGING_VERIFIED: ["APPROVED"],
    APPROVED: ["DEPLOYING"],
    DEPLOYING: ["LIVE", "ROLLED_BACK"],
    LIVE: [],
    ROLLED_BACK: [],
  },
  terminal: ["LIVE", "ROLLED_BACK"],
} as const satisfies Machine<string>;

export function advanceRelease(from: string, to: string): string {
  return transition(RELEASE_MACHINE, from as never, to as never);
}

export function canAdvance(from: string, to: string): boolean {
  return canTransition(RELEASE_MACHINE, from as never, to as never);
}

/** The author of a release cannot approve it (CP-CICD-03). Identities are compared case-insensitively. */
export function approvalProblem(author: string, approver: string): string | null {
  if (!approver.trim()) return "an approver is required";
  if (author.trim().toLowerCase() === approver.trim().toLowerCase()) return "the release author cannot approve their own release (CP-CICD-03)";
  return null;
}

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
