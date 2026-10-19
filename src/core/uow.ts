// Unit of work (Part 05 REQ-CORE-F03). A business write, its audit entry, its action-ledger row, its protocol evaluation log and
// its outbox event commit in ONE transaction, or none of them do. The audit, ledger and evaluation tables are interim adapters
// (Parts 08 and 17 replace them behind this interface).
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../db/transactions";
import { enqueueEvent, type OutboxEvent } from "../db/outbox";
import type { RequestContext } from "./context";

export type LifecycleAction = "CREATED" | "SUBMITTED" | "VERIFIED" | "REVIEWED" | "APPROVED" | "REJECTED" | "RETURNED" | "MODIFIED" | "EXECUTED" | "RECORDED" | "RECONCILED" | "CLOSED" | "CANCELLED" | "REVERSED";
export type ProtocolResult = "PASS" | "WARN" | "EXCEPTION_REQUIRED" | "BLOCK";

export interface UnitOfWork {
  readonly client: PoolClient;
  audit(entry: { action: string; entityType: string; entityId: string; detail?: Record<string, unknown> }): Promise<void>;
  ledger(entry: { action: LifecycleAction; entityType: string; entityId: string; reason?: string }): Promise<void>;
  evaluate(entry: { cpCode: string; result: ProtocolResult; detail?: Record<string, unknown> }): Promise<void>;
  emit(event: OutboxEvent): Promise<string>;
}

export async function runUnitOfWork<T>(pool: Pool, ctx: RequestContext, work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
  return withTransaction(
    pool,
    async (client) => {
      const uow: UnitOfWork = {
        client,
        async audit(e) {
          await client.query(
            `INSERT INTO core_audit_entries (tenant_id, actor_id, action, entity_type, entity_id, correlation_id, detail)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [ctx.tenantId, ctx.userId, e.action, e.entityType, e.entityId, ctx.correlationId, JSON.stringify(e.detail ?? {})],
          );
        },
        async ledger(e) {
          await client.query(
            `INSERT INTO core_action_ledger (tenant_id, actor_id, lifecycle_action, entity_type, entity_id, reason, correlation_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [ctx.tenantId, ctx.userId, e.action, e.entityType, e.entityId, e.reason ?? null, ctx.correlationId],
          );
        },
        async evaluate(e) {
          await client.query(
            `INSERT INTO core_protocol_evaluations (tenant_id, cp_code, result, detail, correlation_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [ctx.tenantId, e.cpCode, e.result, JSON.stringify(e.detail ?? {}), ctx.correlationId],
          );
        },
        emit(event) {
          return enqueueEvent(client, { ...event, tenantId: event.tenantId ?? ctx.tenantId });
        },
      };
      return work(uow);
    },
    { tenantId: ctx.tenantId, userId: ctx.userId },
  );
}
