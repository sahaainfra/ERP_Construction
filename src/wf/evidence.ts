// Approval evidence panel and decision snapshots (Part 16 REQ-WF-F13, CP-WF-05; A-150). Each section names its source. A source that is not
// built is shown as unavailable with the reason, never left out. The panel the approver sees is stored with the decision, so the record shows
// what they were looking at (BLOCK on approval or rejection if the snapshot cannot be stored).
import type { PoolClient } from "pg";

export interface EvidenceSource {
  id: string;
  title: string;
  /** The part that owns the data, where the program names one. */
  owner: string;
  built: boolean;
  reason: string;
}

/** Sources the panel reads. Only the workflow's own records are built in this part; the rest report unavailable until their part is built. */
export const EVIDENCE_SOURCES: EvidenceSource[] = [
  { id: "workflow.amount", title: "Amount and same-key total", owner: "Part 16", built: true, reason: "" },
  { id: "workflow.history", title: "Approval history", owner: "Part 16", built: true, reason: "" },
  { id: "budget.position", title: "Budget, committed and available", owner: "budget source, owning part to be confirmed", built: false, reason: "budget source not built yet" },
  { id: "rates.benchmark", title: "Last five purchase rates and benchmark", owner: "Part 44", built: false, reason: "rate intelligence not built yet (Part 44)" },
  { id: "vendor.performance", title: "Vendor performance and disputes", owner: "Part 44", built: false, reason: "vendor performance not built yet (Part 44)" },
  { id: "procurement.quotes", title: "Quotations and comparison ranking", owner: "Part 46", built: false, reason: "procurement not built yet (Part 46)" },
  { id: "stores.stock", title: "Stock and pending purchase orders for the item", owner: "Part 47", built: false, reason: "stores not built yet (Part 47)" },
  { id: "treasury.cash", title: "Cash forecast impact (7, 30, 60 and 90 days)", owner: "Part 65", built: false, reason: "Cash forecast unavailable: the treasury source is not built yet (Part 65)" },
  { id: "contract.impact", title: "Contract value, margin and obligations", owner: "contract source, owning part to be confirmed", built: false, reason: "contract source not built yet" },
  { id: "protocol.gates", title: "Protocol gate results and linked exceptions", owner: "Part 17", built: false, reason: "protocol gates not built yet (Part 17)" },
];

export interface EvidenceInput {
  docType: string;
  amountPaise: number | null;
  /** Earlier orders with the same split key inside the window, in paise. */
  priorPaise: number;
  history: { action: string; actor: string; at: string }[];
}

export interface EvidenceSection {
  id: string;
  title: string;
  status: "available" | "unavailable";
  value?: unknown;
  reason?: string;
}

export interface EvidenceView {
  docType: string;
  sections: EvidenceSection[];
  unavailableCount: number;
}

/** The panel: every declared source appears once, in order, either with its value or with the reason it is unavailable. */
export function buildEvidence(input: EvidenceInput): EvidenceView {
  const sections = EVIDENCE_SOURCES.map((s): EvidenceSection => {
    if (!s.built) return { id: s.id, title: s.title, status: "unavailable", reason: s.reason };
    if (s.id === "workflow.amount") {
      return {
        id: s.id,
        title: s.title,
        status: "available",
        value: { amountPaise: input.amountPaise, priorPaise: input.priorPaise, cumulativePaise: (input.amountPaise ?? 0) + input.priorPaise },
      };
    }
    return { id: s.id, title: s.title, status: "available", value: input.history };
  });
  return { docType: input.docType, sections, unavailableCount: sections.filter((s) => s.status === "unavailable").length };
}

/** Stores the panel the approver saw. Called inside the decision's transaction, so the decision cannot land without its snapshot. */
export async function storeSnapshot(c: PoolClient, tenantId: string, input: { instanceId: number; taskId: number; action: "approve" | "reject"; actor: string; view: EvidenceView }): Promise<void> {
  await c.query(
    "INSERT INTO dec_context_snapshots (tenant_id, instance_id, task_id, action, actor, context_json) VALUES ($1, $2, $3, $4, $5, $6)",
    [tenantId, input.instanceId, input.taskId, input.action, input.actor, JSON.stringify(input.view)],
  );
}
