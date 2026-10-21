// Segregation of duties (Part 07 slice S3; REQ-IAM-F14 to F16; CP-IAM-02). A rule names two actions that one person must not
// both do to the same record. Rules move draft → observe (findings only) → enforce (blocks). Enforcing needs a second approver.
// Each action on a record takes a transaction-scoped advisory lock on that record, so two conflicting actions that race
// cannot both pass: the second one sees the first in the log.
import type { Pool, PoolClient } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { runUnitOfWork } from "../core/uow";
import { withTransaction } from "../db/transactions";
import { can } from "./pdp";
import { personOf, sameActor } from "./actors";

export const ACTION_KEY = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$/;
const MAX_EXCEPTION_DAYS = 90;

/**
 * The sixteen seed rules named in Part 07 REQ-IAM-F14. The action keys are the names the owning modules will emit; they are
 * confirmed when those modules are built (assumption A-15). Seeded as drafts: a draft rule changes nothing.
 */
export const SEED_RULES: readonly { code: string; description: string; left: string; right: string; exceptionAllowed: boolean }[] = [
  { code: "PR_REQUEST_APPROVE", description: "Requester and approver of a material request must differ", left: "pr.request.create", right: "pr.request.approve", exceptionAllowed: true },
  { code: "PR_CREATE_APPROVE", description: "Creator and approver of a purchase requisition must differ", left: "purchase.requisition.create", right: "purchase.requisition.approve", exceptionAllowed: true },
  { code: "PO_CREATE_APPROVE", description: "Creator and approver of a purchase order must differ", left: "purchase.order.create", right: "purchase.order.approve", exceptionAllowed: true },
  { code: "PO_CREATE_RECEIVE", description: "Purchaser and goods receiver must differ", left: "purchase.order.create", right: "goods.receipt.record", exceptionAllowed: true },
  { code: "AUTH_CUSTODY", description: "Procurement authority and stock custody must differ", left: "purchase.authority.exercise", right: "stock.custody.hold", exceptionAllowed: true },
  { code: "ISSUE_ADJUST_APPROVE", description: "Store issuer and stock adjustment approver must differ", left: "stock.issue.create", right: "stock.adjustment.approve", exceptionAllowed: true },
  { code: "MB_RECORD_CHECK", description: "Measurement recorder and checker must differ", left: "measurement.book.record", right: "measurement.book.check", exceptionAllowed: true },
  { code: "BILL_CREATE_CERTIFY", description: "Bill creator and certifier must differ", left: "billing.bill.create", right: "billing.bill.certify", exceptionAllowed: true },
  { code: "VENDOR_CREATE_VERIFY_BANK", description: "Vendor creator and bank verifier must differ", left: "vendor.master.create", right: "vendor.bank.verify", exceptionAllowed: true },
  { code: "BANK_CHANGE_PAY_APPROVE", description: "Vendor bank changer and payment approver must differ (30-day window not yet modelled)", left: "vendor.bank.change", right: "payment.release.approve", exceptionAllowed: false },
  { code: "PAY_MAKE_APPROVE", description: "Payment maker and payment approver must differ", left: "payment.release.create", right: "payment.release.approve", exceptionAllowed: false },
  { code: "PAYROLL_PREPARE_APPROVE", description: "Payroll preparer and payroll approver must differ", left: "payroll.run.prepare", right: "payroll.run.approve", exceptionAllowed: true },
  { code: "BUDGET_PREPARE_APPROVE", description: "Budget preparer and budget approver must differ", left: "budget.version.prepare", right: "budget.version.approve", exceptionAllowed: true },
  { code: "JOURNAL_POST_REVERSE", description: "Journal poster and reversal approver must differ", left: "ledger.journal.post", right: "ledger.journal.reverse_approve", exceptionAllowed: true },
  { code: "ATTEND_MARK_APPROVE", description: "Attendance marker and attendance approver must differ for the same crew", left: "attendance.mark", right: "attendance.approve", exceptionAllowed: true },
  { code: "PROTOCOL_PROPOSE_APPROVE", description: "Protocol threshold proposer and approver must differ", left: "protocol.threshold.propose", right: "protocol.threshold.approve", exceptionAllowed: true },
];

export async function seedRules(pool: Pool, ctx: RequestContext): Promise<number> {
  const allowed = await can(pool, ctx, "iam.sod.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  let added = 0;
  for (const r of SEED_RULES) {
    const res = await withTransaction(
      pool,
      (c) => c.query(
        `INSERT INTO iam_sod_rules (tenant_id, rule_code, description, left_action, right_action, exception_allowed, created_by, change_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Seeded from Part 07 REQ-IAM-F14 (assumption A-15)') ON CONFLICT (tenant_id, rule_code) DO NOTHING`,
        [ctx.tenantId, r.code, r.description, r.left, r.right, r.exceptionAllowed, ctx.userId],
      ),
      { tenantId: ctx.tenantId },
    );
    added += res.rowCount ?? 0;
  }
  return added;
}

interface RuleRow {
  id: string;
  rule_code: string;
  left_action: string;
  right_action: string;
  exception_allowed: boolean;
  enforcement: "observe" | "enforce";
}

/** Two accounts of one employee are one actor. Links are written by an administrator. */
export async function linkActor(pool: Pool, ctx: RequestContext, actorRef: string, personRef: string): Promise<void> {
  const allowed = await can(pool, ctx, "iam.sod.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  await withTransaction(
    pool,
    (c) => c.query("INSERT INTO iam_actor_links (tenant_id, actor_ref, person_ref, linked_by) VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id, actor_ref) DO UPDATE SET person_ref = EXCLUDED.person_ref, linked_by = EXCLUDED.linked_by", [ctx.tenantId, actorRef, personRef, ctx.userId]),
    { tenantId: ctx.tenantId },
  );
}


export interface Violation {
  ruleCode: string;
  ruleId: number;
  enforcement: "observe" | "enforce";
  covered: boolean;
  conflictingAction: string;
}

async function coveredByException(client: PoolClient, tenantId: string, ruleId: number, person: string, projectId: string | null): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM iam_sod_exceptions WHERE tenant_id = $1 AND rule_id = $2 AND person_ref = $3 AND approval_status = 'approved'
       AND valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE AND (project_id IS NULL OR project_id = $4)`,
    [tenantId, ruleId, person, projectId],
  );
  return (rowCount ?? 0) > 0;
}

/** Finds the rules an action would break, given what this person (across linked accounts) already did to the record. */
export async function preventiveCheck(client: PoolClient, tenantId: string, actorRef: string, actionKey: string, entityType: string, entityId: string, projectId: string | null): Promise<Violation[]> {
  const person = await personOf(client, tenantId, actorRef);
  const { rows: rules } = await client.query<RuleRow>(
    "SELECT id, rule_code, left_action, right_action, exception_allowed, enforcement FROM iam_sod_rules WHERE tenant_id = $1 AND enforcement IN ('observe','enforce') AND (left_action = $2 OR right_action = $2)",
    [tenantId, actionKey],
  );
  const violations: Violation[] = [];
  for (const rule of rules) {
    const other = rule.left_action === actionKey ? rule.right_action : rule.left_action;
    const prior = await client.query(
      `SELECT 1 FROM iam_action_log l LEFT JOIN iam_actor_links k ON k.tenant_id = l.tenant_id AND k.actor_ref = l.actor_ref
        WHERE l.tenant_id = $1 AND l.entity_type = $2 AND l.entity_id = $3 AND l.action_key = $4 AND COALESCE(k.person_ref, l.actor_ref) = $5 LIMIT 1`,
      [tenantId, entityType, entityId, other, person],
    );
    if ((prior.rowCount ?? 0) === 0) continue;
    const covered = await coveredByException(client, tenantId, Number(rule.id), person, projectId);
    violations.push({ ruleCode: rule.rule_code, ruleId: Number(rule.id), enforcement: rule.enforcement, covered, conflictingAction: other });
  }
  return violations;
}

/**
 * Records an action on a record after the segregation check. An enforced, uncovered conflict is refused and recorded as a
 * CP-IAM-02 BLOCK. An observed conflict is allowed and written to the findings.
 */
export async function recordAction(pool: Pool, ctx: RequestContext, input: { actionKey: string; entityType: string; entityId: string; projectId?: string | null }): Promise<{ violations: Violation[] }> {
  if (!ACTION_KEY.test(input.actionKey)) throw new AppError("VALIDATION_FAILED", "the action key is not valid", [{ field: "actionKey", message: "module.object.action" }]);
  const projectId = input.projectId ?? null;
  const result = await runUnitOfWork(pool, ctx, async (uow) => {
    await uow.client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${ctx.tenantId}:${input.entityType}:${input.entityId}`]);
    const violations = await preventiveCheck(uow.client, ctx.tenantId, ctx.userId, input.actionKey, input.entityType, input.entityId, projectId);
    const blocking = violations.filter((v) => v.enforcement === "enforce" && !v.covered);
    if (blocking.length > 0) return { blocking, violations };
    const person = await personOf(uow.client, ctx.tenantId, ctx.userId);
    for (const v of violations.filter((x) => x.enforcement === "observe" && !x.covered)) {
      await uow.client.query(
        `INSERT INTO iam_sod_findings (tenant_id, rule_id, person_ref, entity_type, entity_id, source)
         SELECT $1, $2, $3, $4, $5, 'preventive_observe'
          WHERE NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (rule_id, entity_type, entity_id, person_ref) rule_id, entity_type, entity_id, person_ref, status
                                             FROM iam_sod_findings WHERE tenant_id = $1 AND rule_id = $2 AND entity_type = $4 AND entity_id = $5 AND person_ref = $3
                                            ORDER BY rule_id, entity_type, entity_id, person_ref, detected_at DESC, id DESC) latest WHERE latest.status = 'open')`,
        [ctx.tenantId, v.ruleId, person, input.entityType, input.entityId],
      );
    }
    await uow.client.query(
      "INSERT INTO iam_action_log (tenant_id, actor_ref, action_key, entity_type, entity_id, correlation_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [ctx.tenantId, ctx.userId, input.actionKey, input.entityType, input.entityId, ctx.correlationId],
    );
    await uow.audit({ action: "iam.action.recorded", entityType: input.entityType, entityId: input.entityId, detail: { action: input.actionKey, observed: violations.length } });
    await uow.ledger({ action: "EXECUTED", entityType: input.entityType, entityId: input.entityId });
    return { blocking: [] as Violation[], violations };
  });
  if (result.blocking.length > 0) {
    await runUnitOfWork(pool, ctx, async (uow) => {
      await uow.evaluate({ cpCode: "CP-IAM-02", result: "BLOCK", detail: { action: input.actionKey, rules: result.blocking.map((b) => b.ruleCode), entity: `${input.entityType}:${input.entityId}` } });
    });
    throw new AppError("PROTOCOL_BLOCKED", `segregation of duties: ${result.blocking.map((b) => b.ruleCode).join(", ")}`);
  }
  return { violations: result.violations };
}

export async function proposeRule(pool: Pool, ctx: RequestContext, input: { code: string; description: string; left: string; right: string; exceptionAllowed?: boolean; reason: string }): Promise<{ id: number }> {
  const allowed = await can(pool, ctx, "iam.sod.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  if (!ACTION_KEY.test(input.left) || !ACTION_KEY.test(input.right) || input.left === input.right) throw new AppError("VALIDATION_FAILED", "two different action keys are needed", [{ field: "left", message: "invalid" }]);
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  return runUnitOfWork(pool, ctx, async (uow) => {
    const { rows } = await uow.client.query<{ id: string }>(
      "INSERT INTO iam_sod_rules (tenant_id, rule_code, description, left_action, right_action, exception_allowed, created_by, change_reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
      [ctx.tenantId, input.code, input.description, input.left, input.right, input.exceptionAllowed ?? true, ctx.userId, input.reason],
    );
    await uow.audit({ action: "iam.sod_rule.proposed", entityType: "sod_rule", entityId: rows[0].id, detail: { code: input.code } });
    return { id: Number(rows[0].id) };
  });
}

/** Moves a draft rule to observe. A second person approves it (CP-IAM-01). */
export async function approveRule(pool: Pool, ctx: RequestContext, id: number, reason: string): Promise<void> {
  if (reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  const allowed = await can(pool, ctx, "iam.sod.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ created_by: string; enforcement: string }>("SELECT created_by, enforcement FROM iam_sod_rules WHERE id = $1 FOR UPDATE", [id]);
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the rule was not found");
    if (await sameActor(uow.client, ctx.tenantId, found.rows[0].created_by, ctx.userId)) throw new AppError("MAKER_CHECKER_REQUIRED", "the creator cannot approve their own rule");
    if (found.rows[0].enforcement !== "draft") throw new AppError("CONFLICT", "the rule is not a draft");
    await uow.client.query("UPDATE iam_sod_rules SET enforcement = 'observe', approved_by = $2 WHERE id = $1", [id, ctx.userId]);
    await uow.audit({ action: "iam.sod_rule.approved", entityType: "sod_rule", entityId: String(id), detail: { reason } });
    await uow.evaluate({ cpCode: "CP-IAM-01", result: "PASS", detail: { action: "approve_sod_rule" } });
  });
}

/** Moves an observed rule to enforce, or retires it. Enforcing needs a third person: not the creator, not the observer approver. */
export async function setEnforcement(pool: Pool, ctx: RequestContext, id: number, to: "enforce" | "retired", reason: string): Promise<void> {
  if (reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  const allowed = await can(pool, ctx, "iam.sod.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ created_by: string; approved_by: string | null; enforcement: string }>("SELECT created_by, approved_by, enforcement FROM iam_sod_rules WHERE id = $1 FOR UPDATE", [id]);
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the rule was not found");
    const rule = found.rows[0];
    if (to === "enforce") {
      if (rule.enforcement !== "observe") throw new AppError("CONFLICT", "only an observed rule can be enforced");
      if ((await sameActor(uow.client, ctx.tenantId, ctx.userId, rule.created_by)) || (rule.approved_by !== null && (await sameActor(uow.client, ctx.tenantId, ctx.userId, rule.approved_by)))) {
        throw new AppError("MAKER_CHECKER_REQUIRED", "enforcing needs a different person from the creator and the observer approver");
      }
      await uow.client.query("UPDATE iam_sod_rules SET enforcement = 'enforce', enforce_approved_by = $2 WHERE id = $1", [id, ctx.userId]);
    } else {
      await uow.client.query("UPDATE iam_sod_rules SET enforcement = 'retired' WHERE id = $1", [id]);
    }
    await uow.audit({ action: `iam.sod_rule.${to}`, entityType: "sod_rule", entityId: String(id), detail: { reason } });
    await uow.evaluate({ cpCode: "CP-IAM-02", result: "PASS", detail: { action: `set_${to}` } });
  });
}

export async function proposeException(pool: Pool, ctx: RequestContext, input: { ruleId: number; personRef: string; projectId?: string | null; reason: string; compensatingControl: string; validFrom: string; validTo: string }): Promise<{ id: number }> {
  const allowed = await can(pool, ctx, "iam.sod.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  if (input.reason.trim().length < 20 || input.compensatingControl.trim().length < 20) throw new AppError("VALIDATION_FAILED", "the reason and the compensating control need at least 20 characters each");
  const days = (Date.parse(input.validTo) - Date.parse(input.validFrom)) / 86_400_000;
  if (!(days >= 0 && days <= MAX_EXCEPTION_DAYS)) throw new AppError("VALIDATION_FAILED", `an exception lasts at most ${MAX_EXCEPTION_DAYS} days`, [{ field: "validTo", message: "too long" }]);
  return runUnitOfWork(pool, ctx, async (uow) => {
    const rule = await uow.client.query<{ exception_allowed: boolean }>("SELECT exception_allowed FROM iam_sod_rules WHERE id = $1", [input.ruleId]);
    if (rule.rowCount === 0) throw new AppError("NOT_FOUND", "the rule was not found");
    if (!rule.rows[0].exception_allowed) throw new AppError("PROTOCOL_BLOCKED", "this rule does not allow exceptions");
    const { rows } = await uow.client.query<{ id: string }>(
      `INSERT INTO iam_sod_exceptions (tenant_id, rule_id, person_ref, project_id, reason, compensating_control, valid_from, valid_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [ctx.tenantId, input.ruleId, input.personRef, input.projectId ?? null, input.reason, input.compensatingControl, input.validFrom, input.validTo, ctx.userId],
    );
    await uow.audit({ action: "iam.sod_exception.proposed", entityType: "sod_exception", entityId: rows[0].id, detail: { ruleId: input.ruleId } });
    return { id: Number(rows[0].id) };
  });
}

export async function approveException(pool: Pool, ctx: RequestContext, id: number): Promise<void> {
  const allowed = await can(pool, ctx, "iam.sod.exception.approve");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  await runUnitOfWork(pool, ctx, async (uow) => {
    const found = await uow.client.query<{ created_by: string; approval_status: string; person_ref: string }>("SELECT created_by, approval_status, person_ref FROM iam_sod_exceptions WHERE id = $1 FOR UPDATE", [id]);
    if (found.rowCount === 0) throw new AppError("NOT_FOUND", "the exception was not found");
    // Neither the requester nor the person the exception covers (on any of their accounts) may approve it.
    if (await sameActor(uow.client, ctx.tenantId, found.rows[0].created_by, ctx.userId) || (await sameActor(uow.client, ctx.tenantId, found.rows[0].person_ref, ctx.userId))) {
      throw new AppError("MAKER_CHECKER_REQUIRED", "the requester and the covered person cannot approve the exception");
    }
    if (found.rows[0].approval_status !== "pending") throw new AppError("CONFLICT", "the exception has already been decided");
    await uow.client.query("UPDATE iam_sod_exceptions SET approval_status = 'approved', approved_by = $2 WHERE id = $1", [id, ctx.userId]);
    await uow.audit({ action: "iam.sod_exception.approved", entityType: "sod_exception", entityId: String(id), detail: {} });
    await uow.evaluate({ cpCode: "CP-IAM-02", result: "EXCEPTION_REQUIRED", detail: { exceptionId: id, decided: "approved" } });
  });
}

/**
 * Detective scan (REQ-IAM-F15): finds every record where one person did both actions of an active rule and no approved
 * exception covers it. New findings are added; an open finding is never added twice. Returns the number added.
 */
export async function detectiveScan(pool: Pool, ctx: RequestContext): Promise<number> {
  const allowed = await can(pool, ctx, "iam.sod.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  return withTransaction(
    pool,
    async (client) => {
      // One scan at a time per tenant, so two scans cannot both add the same finding.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${ctx.tenantId}:detective-scan`]);
      const { rows: rules } = await client.query<RuleRow>("SELECT id, rule_code, left_action, right_action, exception_allowed, enforcement FROM iam_sod_rules WHERE tenant_id = $1 AND enforcement IN ('observe','enforce')", [ctx.tenantId]);
      let added = 0;
      for (const rule of rules) {
        const pairs = await client.query<{ entity_type: string; entity_id: string; person: string }>(
          `SELECT DISTINCT l1.entity_type, l1.entity_id, COALESCE(k1.person_ref, l1.actor_ref) AS person
             FROM iam_action_log l1
             JOIN iam_action_log l2 ON l2.tenant_id = l1.tenant_id AND l2.entity_type = l1.entity_type AND l2.entity_id = l1.entity_id AND l2.action_key = $3
             LEFT JOIN iam_actor_links k1 ON k1.tenant_id = l1.tenant_id AND k1.actor_ref = l1.actor_ref
             LEFT JOIN iam_actor_links k2 ON k2.tenant_id = l2.tenant_id AND k2.actor_ref = l2.actor_ref
            WHERE l1.tenant_id = $1 AND l1.action_key = $2 AND COALESCE(k1.person_ref, l1.actor_ref) = COALESCE(k2.person_ref, l2.actor_ref)`,
          [ctx.tenantId, rule.left_action, rule.right_action],
        );
        for (const p of pairs.rows) {
          if (await coveredByException(client, ctx.tenantId, Number(rule.id), p.person, null)) continue;
          const res = await client.query(
            `INSERT INTO iam_sod_findings (tenant_id, rule_id, person_ref, entity_type, entity_id, source)
             SELECT $1, $2, $3, $4, $5, 'detective_scan'
              WHERE NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (rule_id, entity_type, entity_id, person_ref) rule_id, entity_type, entity_id, person_ref, status
                                                 FROM iam_sod_findings WHERE tenant_id = $1 AND rule_id = $2 AND entity_type = $4 AND entity_id = $5 AND person_ref = $3
                                                ORDER BY rule_id, entity_type, entity_id, person_ref, detected_at DESC, id DESC) latest WHERE latest.status = 'open')`,
            [ctx.tenantId, Number(rule.id), p.person, p.entity_type, p.entity_id],
          );
          added += res.rowCount ?? 0;
        }
      }
      return added;
    },
    { tenantId: ctx.tenantId },
  );
}

export async function openFindings(pool: Pool, ctx: RequestContext): Promise<number> {
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM (SELECT DISTINCT ON (rule_id, entity_type, entity_id, person_ref) status FROM iam_sod_findings WHERE tenant_id = $1
          ORDER BY rule_id, entity_type, entity_id, person_ref, detected_at DESC, id DESC) latest WHERE status = 'open'`,
        [ctx.tenantId],
      );
      return Number(rows[0].n);
    },
    { tenantId: ctx.tenantId },
  );
}

/** Marks a finding resolved by appending a resolved row. The earlier rows stay. */
export async function resolveFinding(pool: Pool, ctx: RequestContext, input: { ruleId: number; entityType: string; entityId: string; personRef: string; reason: string }): Promise<void> {
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short");
  const allowed = await can(pool, ctx, "iam.sod.manage");
  if (!allowed.allowed) throw new AppError("FORBIDDEN", allowed.reason);
  await runUnitOfWork(pool, ctx, async (uow) => {
    const res = await uow.client.query(
      `INSERT INTO iam_sod_findings (tenant_id, rule_id, person_ref, entity_type, entity_id, source, status)
       SELECT $1, $2, $3, $4, $5, 'detective_scan', 'resolved'
        WHERE EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (rule_id, entity_type, entity_id, person_ref) rule_id, entity_type, entity_id, person_ref, status
                                       FROM iam_sod_findings WHERE tenant_id = $1 AND rule_id = $2 AND entity_type = $4 AND entity_id = $5 AND person_ref = $3
                                      ORDER BY rule_id, entity_type, entity_id, person_ref, detected_at DESC, id DESC) latest WHERE latest.status = 'open')`,
      [ctx.tenantId, input.ruleId, input.personRef, input.entityType, input.entityId],
    );
    if ((res.rowCount ?? 0) === 0) throw new AppError("CONFLICT", "there is no open finding for this record");
    await uow.audit({ action: "iam.sod_finding.resolved", entityType: input.entityType, entityId: input.entityId, detail: { reason: input.reason } });
    await uow.evaluate({ cpCode: "CP-IAM-02", result: "PASS", detail: { action: "resolve_finding" } });
  });
}
