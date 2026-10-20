// Route registry rules (Part 07 S5; CP-IAM-05). Pure.
import { describe, expect, it } from "vitest";
import { pathOfRouteFile, registryProblems, ROUTE_REGISTRY } from "./routes";

describe("route registry (REQ-IAM-F22; CP-IAM-05)", () => {
  it("maps a route file to its URL path", () => {
    expect(pathOfRouteFile("src/app/api/v1/health/route.ts")).toBe("/api/v1/health");
    expect(pathOfRouteFile("src/app/health/live/route.ts")).toBe("/health/live");
  });

  it("passes when every route file has an entry and every public route gives a reason", () => {
    expect(registryProblems(["src/app/api/v1/health/route.ts", "src/app/health/live/route.ts", "src/app/health/ready/route.ts"])).toEqual([]);
    expect(ROUTE_REGISTRY.every((r) => r.permissionKey !== null || r.publicReason)).toBe(true);
  });

  it("fails a route that is not registered, an entry with no file, and a public route with no reason", () => {
    expect(registryProblems(["src/app/admin/users/route.ts"]).join(" ")).toMatch(/\/admin\/users is not in the route registry/);
    expect(registryProblems([], [{ path: "/api/v1/ghost", kind: "rest", permissionKey: null, publicReason: "x" }]).join(" ")).toMatch(/has no route file/);
    expect(registryProblems(["src/app/x/route.ts"], [{ path: "/x", kind: "rest", permissionKey: null }]).join(" ")).toMatch(/must give a reason/);
  });
});
