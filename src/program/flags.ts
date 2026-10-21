// Feature-flag registry rules (Part 04 REQ-CICD-F09; Part 00 A3). Flags are default OFF in production until accepted.

export const FLAG_KEY = /^ff\.[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)?$/;
export const STALE_DAYS = 90;

export interface FlagRecord {
  key: string;
  owner: string;
  module_code: string;
  defaults_by_env: Partial<Record<"development" | "test" | "staging" | "production", boolean>>;
  /** Date the flag was fully turned ON for every environment, if it was. */
  fully_on_since?: string | null;
  kill_switch: boolean;
  financial?: boolean;
  business_owner_approved_production?: boolean;
}

export function flagProblems(flag: FlagRecord, today: Date): string[] {
  const problems: string[] = [];
  if (!FLAG_KEY.test(flag.key)) problems.push(`${flag.key}: key must be ff.<code>[.<feature>]`);
  if (!flag.owner) problems.push(`${flag.key}: an owner is required`);
  if (!flag.kill_switch) problems.push(`${flag.key}: every flag needs a kill switch`);
  if (flag.defaults_by_env.production === true) problems.push(`${flag.key}: default ON in production (A3: default OFF until accepted)`);
  if (flag.financial && flag.defaults_by_env.production === true && !flag.business_owner_approved_production) {
    problems.push(`${flag.key}: financial flags need business-owner approval to be ON in production (CP-CICD-06)`);
  }
  if (flag.fully_on_since) {
    const since = new Date(flag.fully_on_since);
    const days = Math.floor((today.getTime() - since.getTime()) / 86_400_000);
    if (days > STALE_DAYS) problems.push(`${flag.key}: fully ON for ${days} days; schedule its removal`);
  }
  return problems;
}
