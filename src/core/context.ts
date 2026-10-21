// Request context (Part 05 REQ-CORE-F01). Scope is built only from a verified server session or token.
// Client-sent scope (company, project, site ids in bodies, headers or URLs) is never copied here: it is a request to be re-authorised.

export type Channel = "web" | "field" | "portal" | "api" | "job" | "import" | "ai";

export interface VerifiedSession {
  tenantId: string;
  companyId: string;
  legalEntityId?: string;
  branchId?: string;
  projectIds: string[];
  siteIds: string[];
  userId: string;
  impersonatedBy?: string | null;
  roles: string[];
  permissionSnapshotVersion: number;
  locale: string;
  timezone: string;
  device?: string;
}

export interface RequestContext extends VerifiedSession {
  channel: Channel;
  correlationId: string;
  causationId: string | null;
  activeProjectId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Auth User IDs (Part 08A REQ-AUTH-F01): company code plus a five-digit sequence, e.g. ACME00001. A user is identified by it in sessions.
const USER_ID = /^[A-Z][A-Z0-9]{1,7}[0-9]{5,}$/;

/** Builds the context from a verified session. Refuses a session without the mandatory identifiers. */
export function buildContext(session: VerifiedSession, channel: Channel, correlationId: string, causationId: string | null = null, activeProjectId: string | null = null): RequestContext {
  if (!UUID.test(session.tenantId)) throw new RangeError("session has no valid tenant");
  if (!UUID.test(session.userId) && !USER_ID.test(session.userId)) throw new RangeError("session has no valid user");
  if (!correlationId || correlationId.length > 100) throw new RangeError("correlationId is required");
  if (activeProjectId !== null && !session.projectIds.includes(activeProjectId)) {
    throw new RangeError("the active project is not in the session scope");
  }
  return { ...session, channel, correlationId, causationId, activeProjectId };
}

/** A job runs under a service principal: a named identity with an explicit permission list (REQ-CORE-F14). */
export function servicePrincipalContext(tenantId: string, jobType: string, permissions: readonly string[], correlationId: string): RequestContext & { permissions: readonly string[] } {
  return {
    tenantId,
    companyId: tenantId,
    projectIds: [],
    siteIds: [],
    userId: "00000000-0000-4000-8000-00000000c0de",
    impersonatedBy: null,
    roles: ["service"],
    permissionSnapshotVersion: 0,
    locale: "en-IN",
    timezone: "Asia/Kolkata",
    channel: "job",
    correlationId,
    causationId: null,
    activeProjectId: null,
    permissions: [...permissions].sort(),
  };
}

/** Scope comparison used by the protocol and the unit of work: a request is in scope only for a project the session holds. */
export function projectInScope(ctx: Pick<RequestContext, "projectIds">, projectId: string): boolean {
  return ctx.projectIds.includes(projectId);
}
