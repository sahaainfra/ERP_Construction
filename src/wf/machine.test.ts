// Part 16 S1 pure tests: the state-machine checks that must pass before a definition can be activated (REQ-WF-F01), the rules that need
// no session (CP-WF-01, A-148), and the legacy mirror (REQ-WF-F16).
import { describe, expect, it } from "vitest";
import { validateMachine, nextState, type Machine } from "./machine";
import { assertNotSelfApproval, assertReason, routingAmount, takeAmountSnapshot } from "./rules";
import { mirrorLegacy } from "./legacy";

const lifecycle: Machine = {
  initial: "draft",
  states: {
    draft: { kind: "step", step: "originator" },
    review: { kind: "step", step: "review" },
    approved: { kind: "terminal", outcome: "approved" },
    rejected: { kind: "terminal", outcome: "rejected" },
    cancelled: { kind: "terminal", outcome: "cancelled" },
  },
  transitions: [
    { from: "draft", action: "submit", to: "review" },
    { from: "draft", action: "cancel", to: "cancelled" },
    { from: "review", action: "approve", to: "approved" },
    { from: "review", action: "reject", to: "rejected" },
    { from: "review", action: "return", to: "draft" },
    { from: "review", action: "cancel", to: "cancelled" },
  ],
};

describe("definition checks (REQ-WF-F01)", () => {
  it("accepts a lifecycle in which every branch ends and every state is reachable", () => {
    expect(validateMachine(lifecycle)).toEqual([]);
  });

  it("refuses a step with no way out, so a branch can never end", () => {
    const m: Machine = { ...lifecycle, transitions: lifecycle.transitions.filter((t) => t.from !== "review") };
    const problems = validateMachine(m);
    expect(problems).toContain("step state review has no way out");
  });

  it("refuses an unreachable state", () => {
    const m: Machine = { ...lifecycle, states: { ...lifecycle.states, orphan: { kind: "step", step: "x" } } };
    expect(validateMachine(m)).toContain("state orphan cannot be reached");
  });

  it("refuses a terminal state with an outgoing transition, and an unknown target", () => {
    const m: Machine = { ...lifecycle, transitions: [...lifecycle.transitions, { from: "approved", action: "approve", to: "draft" }, { from: "draft", action: "submit", to: "nowhere" }] };
    const problems = validateMachine(m);
    expect(problems).toContain("terminal state approved has outgoing transitions");
    expect(problems).toContain("transition to unknown state nowhere");
    expect(problems).toContain("two transitions for submit from draft");
  });

  it("refuses an unknown action word", () => {
    const m: Machine = { ...lifecycle, transitions: [...lifecycle.transitions, { from: "review", action: "escalate" as never, to: "approved" }] };
    expect(validateMachine(m)).toContain("unknown action escalate");
  });

  it("finds the next state, or none when the action is not allowed", () => {
    expect(nextState(lifecycle, "review", "approve")).toBe("approved");
    expect(nextState(lifecycle, "approved", "approve")).toBeNull();
  });
});

describe("rules that need no session (CP-WF-01, A-148)", () => {
  it("refuses a self-approval", () => {
    expect(() => assertNotSelfApproval("ACME00007", "ACME00007")).toThrow(/cannot approve it/);
    expect(() => assertNotSelfApproval("ACME00008", "ACME00007")).not.toThrow();
  });

  it("requires a reason code and a ten-character comment for rejection, return and cancellation", () => {
    expect(() => assertReason("reject", undefined, "This is not allowed")).toThrow(/reason code/);
    expect(() => assertReason("return", "MISSING_INFO", "short")).toThrow(/10 characters/);
    expect(() => assertReason("cancel", "DUPLICATE", "Raised twice by mistake")).not.toThrow();
    expect(() => assertReason("approve", undefined, undefined)).not.toThrow();
  });

  it("stores the amount to two decimals and refuses a negative or missing-as-NaN amount", () => {
    expect(takeAmountSnapshot(1200000)).toBe("1200000.00");
    expect(takeAmountSnapshot(undefined)).toBeNull();
    expect(() => takeAmountSnapshot(-1)).toThrow();
    expect(() => takeAmountSnapshot(Number.NaN)).toThrow();
  });

  it("routes only from the stored snapshot, and refuses routing without one", () => {
    expect(routingAmount("450000.00")).toBe(450000);
    expect(() => routingAmount(null)).toThrow(/no amount snapshot/);
  });
});

describe("legacy mirror (REQ-WF-F16)", () => {
  it("mirrors a mapped legacy status read-only, and shows an unmapped one as unmapped", () => {
    const map = { PENDING_SITE: "review" };
    expect(mirrorLegacy("PENDING_SITE", map)).toEqual({ legacyStatus: "PENDING_SITE", state: "review", readOnly: true });
    expect(mirrorLegacy("ON_HOLD", map)).toEqual({ legacyStatus: "ON_HOLD", state: "unmapped", readOnly: true });
  });
});
