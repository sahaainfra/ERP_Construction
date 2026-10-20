// Common widgets with real data today (Part 13 REQ-DASH-F03). Each reads through the owning module's own function, which applies its
// own permission check. A widget whose module is not live is not registered (registry.ts). No sample data is shown anywhere.
import { allocatedScopes } from "../org/allocations";
import { listEvents } from "../secgov/security";
import { loginHistory } from "../secgov/security";
import type { WidgetDefinition } from "./types";

const day = (now: Date) => now.toISOString().slice(0, 10);

export const WIDGETS: WidgetDefinition[] = [
  {
    code: "my-projects-sites",
    title: "My projects and sites",
    ownerPart: "06",
    moduleCode: "org",
    permissionKey: null,
    metricCode: "org.allocations.active",
    label: "ACTUAL",
    formulaRef: null,
    threshold: "lists every project and site allocated to you on the current date",
    drillRoute: "/projects",
    sizes: ["m", "l"],
    load: async (pool, ctx, now) => {
      const scopes = await allocatedScopes(pool, ctx, ctx.userId, day(now));
      return {
        kind: "list",
        label: "ACTUAL",
        asOf: now.toISOString(),
        items: scopes.map((s) => ({ text: `${s.projectCode} · ${s.role}${s.siteId === null ? "" : " · site"}`, href: "/projects" })),
      };
    },
  },
  {
    code: "security-alerts",
    title: "Open security alerts",
    ownerPart: "08",
    moduleCode: "secgov",
    permissionKey: "secgov.security.view",
    metricCode: "secgov.events.open",
    label: "ACTUAL",
    formulaRef: null,
    threshold: "flags when any high or critical event is open",
    drillRoute: "/security/events",
    sizes: ["s", "m"],
    load: async (pool, ctx, now) => {
      const open = await listEvents(pool, ctx, { status: "open" });
      return { kind: "metric", value: open.length, unit: "events", period: "open now", label: "ACTUAL", formulaRef: null, asOf: now.toISOString() };
    },
  },
  {
    code: "my-sign-ins",
    title: "My recent sign-ins",
    ownerPart: "08A",
    moduleCode: "auth",
    permissionKey: null,
    metricCode: "auth.signins.recent",
    label: "ACTUAL",
    formulaRef: null,
    threshold: "flags any sign-in attempt that did not succeed",
    drillRoute: "/account/sign-ins",
    sizes: ["s", "m"],
    load: async (pool, ctx, now) => {
      const rows = await loginHistory(pool, ctx, ctx.userId, 5);
      return {
        kind: "list",
        label: "ACTUAL",
        asOf: now.toISOString(),
        items: rows.map((r) => ({ text: `${r.at.toISOString().replace("T", " ").slice(0, 16)} · ${r.outcome}` })),
      };
    },
  },
];
