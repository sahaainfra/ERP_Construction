// Actors and maker-checker (Part 07 REQ-IAM-F15). Two accounts of one employee are one actor. Every "the creator cannot approve"
// check compares the people behind the accounts, not the raw account ids.
import type { PoolClient } from "pg";

export async function personOf(client: PoolClient, tenantId: string, actorRef: string): Promise<string> {
  const { rows } = await client.query<{ person_ref: string }>("SELECT person_ref FROM iam_actor_links WHERE tenant_id = $1 AND actor_ref = $2", [tenantId, actorRef]);
  return rows[0]?.person_ref ?? actorRef;
}

/** True when both account references belong to the same person. */
export async function sameActor(client: PoolClient, tenantId: string, a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  return (await personOf(client, tenantId, a)) === (await personOf(client, tenantId, b));
}

/** Permission keys that the IAM module itself uses. Registered at start-up by every process that runs these services. */
export const IAM_PERMISSIONS = [
  { key: "iam.role.manage", module: "iam", description: "Manage roles and role grants", stage: "APPROVE", sensitivity: "privileged" },
  { key: "iam.assignment.create", module: "iam", description: "Propose a role assignment within own scope", stage: "APPROVE", sensitivity: "privileged" },
  { key: "iam.assignment.approve", module: "iam", description: "Approve a role assignment", stage: "APPROVE", sensitivity: "privileged" },
  { key: "iam.limit.manage", module: "iam", description: "Propose approval authority limits", stage: "APPROVE", sensitivity: "privileged" },
  { key: "iam.limit.approve", module: "iam", description: "Approve approval authority limits", stage: "APPROVE", sensitivity: "privileged" },
  { key: "iam.sod.manage", module: "iam", description: "Manage segregation-of-duties rules and exceptions", stage: "APPROVE", sensitivity: "privileged" },
  { key: "iam.access.revoke", module: "iam", description: "Revoke a person's access", stage: "CLOSE", sensitivity: "privileged" },
  { key: "iam.access.review", module: "iam", description: "Decide and close access reviews", stage: "RECONCILE", sensitivity: "sensitive" },
  { key: "iam.elevation.approve", module: "iam", description: "Approve privileged elevations", stage: "APPROVE", sensitivity: "privileged" },
  { key: "iam.export.manage", module: "iam", description: "Manage export rules", stage: "APPROVE", sensitivity: "privileged" },
  { key: "iam.sod.exception.approve", module: "iam", description: "Approve segregation-of-duties exceptions", stage: "APPROVE", sensitivity: "privileged" },
] as const;
