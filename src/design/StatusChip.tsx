import { Icon, type IconKey } from "./icons";

// DS-6: every state is shown as icon + text inside a chip. Colour is never the only signal.
export const STATUS_STATES = {
  draft: { role: "neutral", icon: "erp.state.draft", label: "Draft" },
  review: { role: "info", icon: "erp.state.review", label: "In review" },
  returned: { role: "warning", icon: "erp.state.returned", label: "Returned" },
  approved: { role: "success", icon: "erp.state.approved", label: "Approved" },
  rejected: { role: "error", icon: "erp.state.rejected", label: "Rejected" },
  cancelled: { role: "neutral", icon: "erp.state.cancelled", label: "Cancelled" },
  closed: { role: "neutral", icon: "erp.state.locked", label: "Closed" },
  hold: { role: "warning", icon: "erp.state.hold", label: "On hold" },
  overdue: { role: "error", icon: "erp.state.overdue", label: "Overdue" },
  exception: { role: "error", icon: "erp.state.exception", label: "Exception" },
  pending_sync: { role: "info", icon: "erp.state.sync", label: "Waiting to sync" },
} as const satisfies Record<string, { role: string; icon: IconKey; label: string }>;

export type StatusState = keyof typeof STATUS_STATES;

export function StatusChip({
  state,
  detail,
}: {
  state: StatusState;
  /** Optional qualifier appended to the label, e.g. the approver role or the overdue period. */
  detail?: string;
}) {
  const { role, icon, label } = STATUS_STATES[state];
  return (
    <span className={`erp-chip erp-chip-${role}`}>
      <Icon name={icon} size={14} />
      <span>{detail ? `${label} — ${detail}` : label}</span>
    </span>
  );
}
