// Code mappings (Part 11 REQ-INTG-F03). A mapping links an ERP code to an external code for one entity. A change adds a new version
// and supersedes the active one; a version is never overwritten, so an old event can always be read against the mapping it used.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { writeAudit } from "../secgov/audit";
import { can } from "../iam/pdp";
import { CONNECTOR_CODE } from "./connectors";

export const MAPPING_ENTITIES = ["item", "ledger", "cost_centre", "employee", "vendor", "bank_code"] as const;
export type MappingEntity = (typeof MAPPING_ENTITIES)[number];

export interface NewMapping {
  connectorCode: string;
  entity: MappingEntity;
  erpCode: string;
  extCode: string;
  reason: string;
}

/** Pure checks on a mapping before it is stored. Returns the problems; an empty list means the mapping is acceptable. */
export function mappingProblems(input: NewMapping): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  if (!CONNECTOR_CODE.test(input.connectorCode)) problems.push({ field: "connectorCode", message: "not a valid connector code" });
  if (!(MAPPING_ENTITIES as readonly string[]).includes(input.entity)) problems.push({ field: "entity", message: `one of ${MAPPING_ENTITIES.join(", ")}` });
  for (const [field, value] of [["erpCode", input.erpCode], ["extCode", input.extCode]] as const) {
    const v = value.trim();
    if (v.length < 1 || v.length > 64) problems.push({ field, message: "1 to 64 characters" });
    else if (/[\u0000-\u001f\u007f]/.test(v)) problems.push({ field, message: "control characters are not allowed" });
    else if (v !== value) problems.push({ field, message: "no leading or trailing spaces" });
  }
  if (input.reason.trim().length < 10) problems.push({ field: "reason", message: "at least 10 characters" });
  return problems;
}

/** Adds a mapping, or a new version of one. Returns the new version number. */
export async function addMapping(pool: Pool, ctx: RequestContext, input: NewMapping): Promise<{ version: number }> {
  const decision = await can(pool, ctx, "intg.connector.manage");
  if (!decision.allowed) throw new AppError("FORBIDDEN", decision.reason);
  const problems = mappingProblems(input);
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the mapping is not valid", problems);

  return withTransaction(
    pool,
    async (client) => {
      const connector = await client.query("SELECT 1 FROM intg_connectors WHERE tenant_id = $1 AND code = $2", [ctx.tenantId, input.connectorCode]);
      if ((connector.rowCount ?? 0) === 0) throw new AppError("NOT_FOUND", "the connector was not found");
      const { rows } = await client.query<{ version: number }>(
        "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM intg_mappings WHERE tenant_id = $1 AND connector_code = $2 AND entity = $3 AND erp_code = $4",
        [ctx.tenantId, input.connectorCode, input.entity, input.erpCode],
      );
      const version = rows[0].version;
      await client.query("UPDATE intg_mappings SET status = 'superseded' WHERE tenant_id = $1 AND connector_code = $2 AND entity = $3 AND erp_code = $4 AND status = 'active'", [ctx.tenantId, input.connectorCode, input.entity, input.erpCode]);
      await client.query(
        "INSERT INTO intg_mappings (tenant_id, connector_code, entity, erp_code, ext_code, version, status, created_by, reason) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)",
        [ctx.tenantId, input.connectorCode, input.entity, input.erpCode, input.extCode, version, ctx.userId, input.reason],
      );
      await writeAudit(client, ctx, { action: "intg.mapping.versioned", entityType: "connector_mapping", entityId: `${input.connectorCode}:${input.entity}:${input.erpCode}#${version}`, reason: input.reason });
      return { version };
    },
    { tenantId: ctx.tenantId },
  );
}
