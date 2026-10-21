// State machines (Part 16 REQ-WF-F01; A-147). Pure rules: a definition is a set of states and transitions. Each step state waits for one
// person; each terminal state ends the workflow. A definition is checked before it can be activated, so every branch ends.
export const ACTIONS = ["submit", "approve", "reject", "return", "resubmit", "cancel", "recall"] as const;
export type Action = (typeof ACTIONS)[number];

export type StateDef =
  | { kind: "step"; step: string; /** Working days allowed for this step. Without it the step has no SLA timer. */ slaWorkingDays?: number }
  | { kind: "terminal"; outcome: "approved" | "rejected" | "returned" | "cancelled" };

export interface Transition {
  from: string;
  action: Action;
  to: string;
}

export interface Machine {
  initial: string;
  states: Record<string, StateDef>;
  transitions: Transition[];
}

/** Every problem with a definition, or none. An empty list means the machine is safe to activate. */
export function validateMachine(m: Machine): string[] {
  const problems: string[] = [];
  const names = Object.keys(m.states);
  if (!m.states[m.initial]) problems.push(`the initial state ${m.initial} is not defined`);
  if (m.states[m.initial]?.kind === "terminal") problems.push("the initial state cannot be terminal");
  const seen = new Set<string>();
  for (const t of m.transitions) {
    if (!m.states[t.from]) problems.push(`transition from unknown state ${t.from}`);
    if (!m.states[t.to]) problems.push(`transition to unknown state ${t.to}`);
    if (!(ACTIONS as readonly string[]).includes(t.action)) problems.push(`unknown action ${t.action}`);
    const key = `${t.from}|${t.action}`;
    if (seen.has(key)) problems.push(`two transitions for ${t.action} from ${t.from}`);
    seen.add(key);
  }
  for (const name of names) {
    const def = m.states[name];
    const out = m.transitions.filter((t) => t.from === name);
    if (def.kind === "terminal" && out.length > 0) problems.push(`terminal state ${name} has outgoing transitions`);
    if (def.kind === "step" && out.length === 0) problems.push(`step state ${name} has no way out`);
  }
  const reachable = reach([m.initial], m.transitions.map((t) => [t.from, t.to]));
  for (const name of names) if (!reachable.has(name)) problems.push(`state ${name} cannot be reached`);
  const terminals = names.filter((n) => m.states[n].kind === "terminal");
  const back = reach(terminals, m.transitions.map((t) => [t.to, t.from]));
  for (const name of names) if (!back.has(name)) problems.push(`state ${name} cannot reach an end`);
  return problems;
}

function reach(start: string[], edges: [string, string][]): Set<string> {
  const seen = new Set<string>(start);
  const queue = [...start];
  while (queue.length) {
    const node = queue.shift()!;
    for (const [from, to] of edges) if (from === node && !seen.has(to)) {
      seen.add(to);
      queue.push(to);
    }
  }
  return seen;
}

/** The state an action leads to from the current state, or null when the action is not allowed there. */
export function nextState(m: Machine, state: string, action: Action): string | null {
  return m.transitions.find((t) => t.from === state && t.action === action)?.to ?? null;
}
