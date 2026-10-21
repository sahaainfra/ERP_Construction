// Comments on a workflow (Part 16 REQ-WF-F06). A comment never changes the state or the version, so it cannot make anyone's decision stale.
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { writeAudit } from "../secgov/audit";
import type { Pool } from "pg";

export async function addComment(pool: Pool, ctx: RequestContext, input: { instanceId: number; body: string }): Promise<{ id: number }> {
  const body = input.body.trim();
  if (body.length === 0 || body.length > 2000) throw new AppError("VALIDATION_FAILED", "a comment must be between 1 and 2000 characters", [{ field: "body", message: "length" }]);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query("SELECT 1 FROM wf_instances WHERE tenant_id = $1 AND id = $2", [ctx.tenantId, input.instanceId]);
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the workflow was not found");
    const inserted = await uow.client.query<{ id: string }>("INSERT INTO wf_comments (tenant_id, instance_id, author, body) VALUES ($1, $2, $3, $4) RETURNING id", [ctx.tenantId, input.instanceId, ctx.userId, body]);
    await writeAudit(uow.client, ctx, { action: "document.commented", entityType: "workflow", entityId: String(input.instanceId), after: { commentId: Number(inserted.rows[0].id) } });
    return { id: Number(inserted.rows[0].id) };
  });
}
