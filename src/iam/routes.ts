// Route registry (Part 07 slice S5; REQ-IAM-F22; CP-IAM-05). Every route file under src/app must have an entry here, so no
// handler is reachable without a declared permission. A public route must give its reason. `npm run iam:routes` (part of
// check:all) fails the build when a route is missing or an entry points at nothing.

export interface RouteEntry {
  /** URL path, for example "/api/v1/health". */
  path: string;
  kind: "rest";
  /** The permission key, or null for a public route. */
  permissionKey: string | null;
  /** Required for a public route: why it needs no permission. */
  publicReason?: string;
}

export const ROUTE_REGISTRY: readonly RouteEntry[] = [
  { path: "/api/v1/health", kind: "rest", permissionKey: null, publicReason: "Database reachability for local checks and load balancers; returns no detail (U15)." },
  { path: "/health/live", kind: "rest", permissionKey: null, publicReason: "Liveness for load balancers; touches nothing." },
  { path: "/health/ready", kind: "rest", permissionKey: null, publicReason: "Readiness for load balancers; reports component state without detail." },
];

/** The URL path a route file serves: src/app/api/v1/health/route.ts → /api/v1/health. */
export function pathOfRouteFile(file: string): string {
  const rel = file.replace(/^src\/app/, "").replace(/\/route\.(ts|tsx|js)$/, "");
  return rel === "" ? "/" : rel;
}

export function registryProblems(routeFiles: readonly string[], registry: readonly RouteEntry[] = ROUTE_REGISTRY): string[] {
  const problems: string[] = [];
  const known = new Set(registry.map((r) => r.path));
  const served = new Set(routeFiles.map(pathOfRouteFile));
  for (const path of served) if (!known.has(path)) problems.push(`route ${path} is not in the route registry`);
  for (const entry of registry) {
    if (!served.has(entry.path)) problems.push(`registry entry ${entry.path} has no route file`);
    if (entry.permissionKey === null && !entry.publicReason) problems.push(`public route ${entry.path} must give a reason`);
    if (entry.permissionKey !== null && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(entry.permissionKey)) problems.push(`route ${entry.path} has an invalid permission key`);
  }
  return problems;
}
