// Tenant branding (Part 12 REQ-DS-F11; A-77 as refined by A-83; CP-DS-03 for major changes). A tenant may choose two brand colours and a
// logo reference. Every proposal is checked against the light surfaces before it is stored, and a failing proposal is refused.
// The brand applies to the light theme only: one colour cannot pass both the white-text rule and the dark-surface rule (A-83).
// Status colours are not an input.
import type { Pool } from "pg";
import { AppError } from "../core/errors";
import type { RequestContext } from "../core/context";
import { withTransaction } from "../db/transactions";
import { writeAudit } from "../secgov/audit";
import { can } from "../iam/pdp";
import { sameActor } from "../iam/actors";
import { COLOUR_TOKENS } from "./tokens";
import { AA_NON_TEXT, AA_TEXT, contrastRatio } from "./contrast";

export const BRANDING_PERMISSIONS = [
  { key: "ui.branding.manage", module: "ui", description: "Propose tenant brand colours and logo", stage: "APPROVE", sensitivity: "privileged" },
  { key: "ui.branding.approve", module: "ui", description: "Approve a brand proposal made by someone else", stage: "APPROVE", sensitivity: "privileged" },
] as const;

export interface BrandInput {
  primary: string;
  accent: string;
  logoRef?: string | null;
  reason: string;
}

export interface ContrastCheck {
  id: string;
  theme: "light";
  ratio: number;
  min: number;
  pass: boolean;
}

export interface ContrastReport {
  pass: boolean;
  checks: ContrastCheck[];
}

const HEX = /^#[0-9A-F]{6}$/;

/** Checks the brand colours on the light surfaces they sit on (A-83). */
export function brandContrast(primary: string, accent: string): ContrastReport {
  const checks: ContrastCheck[] = [];
  for (const theme of ["light"] as const) {
    const surface = COLOUR_TOKENS["bg-surface"][theme];
    const onPrimary = COLOUR_TOKENS["text-on-primary"][theme];
    const add = (id: string, fg: string, bg: string, min: number) => {
      const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
      checks.push({ id, theme, ratio, min, pass: ratio >= min });
    };
    add("text-on-primary", onPrimary, primary, AA_TEXT);
    add("accent-text-on-surface", accent, surface, AA_TEXT);
    add("primary-ui-on-surface", primary, surface, AA_NON_TEXT);
  }
  return { pass: checks.every((c) => c.pass), checks };
}

export function brandProblems(input: BrandInput): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  if (!HEX.test(input.primary)) problems.push({ field: "primary", message: "a six-digit hex colour in capitals" });
  if (!HEX.test(input.accent)) problems.push({ field: "accent", message: "a six-digit hex colour in capitals" });
  if (input.logoRef != null && !/^[a-z0-9_-]{1,80}$/.test(input.logoRef)) problems.push({ field: "logoRef", message: "a document reference of lower-case letters, digits, hyphens and underscores" });
  if (input.reason.trim().length < 10) problems.push({ field: "reason", message: "at least 10 characters" });
  return problems;
}

async function requirePermission(pool: Pool, ctx: RequestContext, key: string): Promise<void> {
  const decision = await can(pool, ctx, key);
  if (!decision.allowed) throw new AppError("FORBIDDEN", decision.reason);
}

/** Proposes a brand. A proposal that fails the contrast check is refused and not stored. Returns the new version and its report. */
export async function proposeBranding(pool: Pool, ctx: RequestContext, input: BrandInput): Promise<{ version: number; report: ContrastReport }> {
  await requirePermission(pool, ctx, "ui.branding.manage");
  const problems = brandProblems(input);
  if (problems.length > 0) throw new AppError("VALIDATION_FAILED", "the branding is not valid", problems);
  const report = brandContrast(input.primary, input.accent);
  if (!report.pass) {
    const failing = report.checks.filter((c) => !c.pass).map((c) => ({ field: c.id, message: `${c.theme}: contrast ${c.ratio} is below ${c.min}` }));
    throw new AppError("VALIDATION_FAILED", "a brand colour fails the contrast check, so it cannot be used", failing);
  }
  const version = await withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ version: number }>("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM ui_branding WHERE tenant_id = $1", [ctx.tenantId]);
      const v = rows[0].version;
      await client.query(
        "INSERT INTO ui_branding (tenant_id, version, brand_primary, brand_accent, logo_ref, status, contrast_report, created_by, reason) VALUES ($1, $2, $3, $4, $5, 'proposed', $6, $7, $8)",
        [ctx.tenantId, v, input.primary, input.accent, input.logoRef ?? null, JSON.stringify(report), ctx.userId, input.reason],
      );
      await writeAudit(client, ctx, { action: "ui.branding.proposed", entityType: "branding", entityId: String(v), reason: input.reason });
      return v;
    },
    { tenantId: ctx.tenantId },
  );
  return { version, report };
}

/** Approves a proposal. The approver must not be the proposer. Approval supersedes the active version. */
export async function approveBranding(pool: Pool, ctx: RequestContext, input: { version: number; reason: string }): Promise<void> {
  await requirePermission(pool, ctx, "ui.branding.approve");
  if (input.reason.trim().length < 10) throw new AppError("VALIDATION_FAILED", "the reason is too short", [{ field: "reason", message: "at least 10 characters" }]);
  await withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ status: string; created_by: string }>("SELECT status, created_by FROM ui_branding WHERE tenant_id = $1 AND version = $2 FOR UPDATE", [ctx.tenantId, input.version]);
      if (rows.length === 0) throw new AppError("NOT_FOUND", "the branding version was not found");
      if (rows[0].status !== "proposed") throw new AppError("CONFLICT", "this branding version is no longer awaiting approval");
      if (await sameActor(client, ctx.tenantId, rows[0].created_by, ctx.userId)) throw new AppError("MAKER_CHECKER_REQUIRED", "the person who proposed a brand cannot approve it");
      await client.query("UPDATE ui_branding SET status = 'superseded' WHERE tenant_id = $1 AND status = 'active'", [ctx.tenantId]);
      await client.query("UPDATE ui_branding SET status = 'active', approved_by = $3, approved_at = now() WHERE tenant_id = $1 AND version = $2", [ctx.tenantId, input.version, ctx.userId]);
      await writeAudit(client, ctx, { action: "ui.branding.changed", entityType: "branding", entityId: String(input.version), reason: input.reason });
    },
    { tenantId: ctx.tenantId },
  );
}

export interface ActiveBranding {
  version: number;
  primary: string;
  accent: string;
  logoRef: string | null;
}

/** The approved brand for a tenant, or null when the defaults apply. */
export async function activeBranding(pool: Pool, tenantId: string): Promise<ActiveBranding | null> {
  return withTransaction(
    pool,
    async (client) => {
      const { rows } = await client.query<{ version: number; brand_primary: string; brand_accent: string; logo_ref: string | null }>(
        "SELECT version, brand_primary, brand_accent, logo_ref FROM ui_branding WHERE tenant_id = $1 AND status = 'active'",
        [tenantId],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return { version: r.version, primary: r.brand_primary, accent: r.brand_accent, logoRef: r.logo_ref };
    },
    { tenantId },
  );
}

/** CSS that overrides the two brand tokens in the light theme. Generated from the approved values only (A-83). */
export function brandingCss(brand: { primary: string; accent: string }): string {
  return `:root,\n:root[data-theme="light"] {\n  --erp-color-brand-primary: ${brand.primary};\n  --erp-color-brand-accent: ${brand.accent};\n}\n`;
}
