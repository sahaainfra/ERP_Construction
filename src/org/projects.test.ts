// Pure lifecycle rules for projects and sites (Part 06 S2).
import { describe, expect, it } from "vitest";
import { PROJECT_STATUSES, PROJECT_TRANSITIONS, SITE_STATUSES, SITE_TRANSITIONS } from "./projects";

function reachable(start: string, graph: Record<string, readonly string[]>): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    for (const next of graph[node] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe("project lifecycle (REQ-ORG-F04)", () => {
  it("covers every status and only moves forward, except the on-hold loop", () => {
    expect(Object.keys(PROJECT_TRANSITIONS).sort()).toEqual([...PROJECT_STATUSES].sort());
    expect(reachable("proposed", PROJECT_TRANSITIONS)).toEqual(new Set(PROJECT_STATUSES));
    expect(PROJECT_TRANSITIONS.active).toEqual(["on_hold", "substantially_complete"]);
    expect(PROJECT_TRANSITIONS.on_hold).toEqual(["active"]);
  });

  it("makes archived terminal and refuses to skip closure", () => {
    expect(PROJECT_TRANSITIONS.archived).toEqual([]);
    expect(PROJECT_TRANSITIONS.active).not.toContain("closed");
    expect(PROJECT_TRANSITIONS.dlp).toEqual(["closed"]);
  });
});

describe("site lifecycle (REQ-ORG-F05)", () => {
  it("follows Planned, Mobilising, Active, with suspension and demobilisation", () => {
    expect(Object.keys(SITE_TRANSITIONS).sort()).toEqual([...SITE_STATUSES].sort());
    expect(reachable("planned", SITE_TRANSITIONS)).toEqual(new Set(SITE_STATUSES));
    expect(SITE_TRANSITIONS.planned).toEqual(["mobilising"]);
    expect(SITE_TRANSITIONS.closed).toEqual([]);
  });
});
