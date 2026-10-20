// Part 12 S2 pure tests: the permission-filtered navigation model (A-76), the mobile bottom bar, and preference validation.
import { describe, expect, it } from "vitest";
import { navigationFor, LIVE_ROUTES, navigationPermissionKeys, type NavEntry } from "./navigation";
import { preferencesProblems, MAX_PINNED } from "./preferences-server";
import registry from "../../design/navigation-registry.json";

const base = registry.entries[0] as unknown as NavEntry;
const gated = { ...base, id: "test.gated", permission: "proj.view", order: 2, mobile_slot: null } as unknown as NavEntry;
const openEntry = { ...base, id: "test.open", order: 1, mobile_slot: null, icon: base.icon } as unknown as NavEntry;

describe("navigation model (REQ-DS-F04, A-76)", () => {
  it("shows an open entry to everyone and a permission-keyed entry only to a user who holds the key", () => {
    const entries = [openEntry, gated];
    expect(navigationFor(new Set(), entries).groups.flatMap((g) => g.entries).map((e) => e.id)).toEqual(["test.open"]);
    expect(navigationFor(new Set(["proj.view"]), entries).groups.flatMap((g) => g.entries).map((e) => e.id)).toEqual(["test.open", "test.gated"]);
  });
  it("never shows an entry whose route is not live, whatever the permissions", () => {
    const notLive = { ...gated, id: "test.notlive", route: "/projects", permission: null } as unknown as NavEntry;
    expect(LIVE_ROUTES.has("/projects")).toBe(false);
    expect(navigationFor(new Set(), [notLive]).groups).toEqual([]);
  });
  it("fills the mobile bottom bar from live entries in the slot order, and nothing else", () => {
    const today = { ...openEntry, id: "test.today", mobile_slot: "today" } as unknown as NavEntry;
    const inbox = { ...openEntry, id: "test.inbox", mobile_slot: "inbox", route: "/inbox" } as unknown as NavEntry;
    const bottom = navigationFor(new Set(), [inbox, today]).bottom.map((e) => e.id);
    expect(bottom).toEqual(["test.today"]);
  });
  it("lists the permission keys the navigation uses, once each", () => {
    expect(navigationPermissionKeys([{ permission: "a.b" }, { permission: "a.b" }, { permission: null }])).toEqual(["a.b"]);
    expect(navigationPermissionKeys()).toEqual([]);
  });
});

describe("preference validation (REQ-DS-F10)", () => {
  it("accepts known values and an openable pinned route", () => {
    expect(preferencesProblems({ theme: "dark", density: "compact", navCollapsed: true, pinned: ["/"] })).toEqual([]);
  });
  it("refuses an unknown theme, density, flag, or a pinned page that is not open", () => {
    expect(preferencesProblems({ theme: "neon" })).toEqual([expect.objectContaining({ field: "theme" })]);
    expect(preferencesProblems({ density: "tiny" })).toEqual([expect.objectContaining({ field: "density" })]);
    expect(preferencesProblems({ navCollapsed: "yes" as unknown as boolean })).toEqual([expect.objectContaining({ field: "navCollapsed" })]);
    expect(preferencesProblems({ pinned: ["/projects"] })).toEqual([expect.objectContaining({ field: "pinned" })]);
  });
  it("refuses more than the pinned limit, and a page pinned twice", () => {
    const many = Array.from({ length: MAX_PINNED + 1 }, () => "/");
    expect(preferencesProblems({ pinned: many }).some((p) => p.message.includes("at most"))).toBe(true);
    expect(preferencesProblems({ pinned: ["/", "/"] }).some((p) => p.message.includes("twice"))).toBe(true);
  });
});
