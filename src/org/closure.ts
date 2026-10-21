// Closure checklist (Part 06 slice S5; REQ-ORG-F12; CP-ORG-03). Items that this codebase can evaluate are evaluated now.
// Items owned by modules that are not built yet are reported as missing, so a closure cannot pass on silence.
import type { PoolClient } from "pg";

export const MODULE_CLOSURE_ITEMS = [
  "open purchase orders and work orders (procurement module not built)",
  "work agreements (subcontract module not built)",
  "open exceptions and findings (quality and HSE modules not built)",
  "unreconciled stock (stores module not built)",
  "unposted bills (billing module not built)",
  "open NCRs and RFIs (quality and documents modules not built)",
  "bank guarantees and insurance expiries (finance module not built)",
  "retention receivable (billing module not built)",
] as const;

/** Returns the closure items that are still open. An empty list means the checklist passes. */
export async function closureChecklist(client: PoolClient, tenantId: string, projectId: number): Promise<string[]> {
  const open: string[] = [];
  const active = await client.query<{ n: string }>(
    "SELECT count(*) AS n FROM org_project_allocations WHERE project_id = $1 AND tenant_id = $2 AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)",
    [projectId, tenantId],
  );
  if (Number(active.rows[0].n) > 0) open.push(`${active.rows[0].n} active allocation(s) must end`);
  const sites = await client.query<{ n: string }>("SELECT count(*) AS n FROM org_sites WHERE project_id = $1 AND tenant_id = $2 AND status <> 'closed'", [projectId, tenantId]);
  if (Number(sites.rows[0].n) > 0) open.push(`${sites.rows[0].n} site(s) not yet closed`);
  open.push(...MODULE_CLOSURE_ITEMS);
  return open;
}
