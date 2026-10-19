// Pure shared-kernel tests (Part 05): error envelope, calendar, flags, cache, rate limit, job backoff, settings validation.
import { describe, expect, it } from "vitest";
import { AppError, ERROR_CATALOGUE, toEnvelope } from "./errors";
import { addDays, financialYear, isWorkingDay, periodNumber, workingDaysBetween, holidaysEffectiveOn, type WorkingCalendar } from "./calendar";
import { bucket, isEnabled, type FlagDefinition } from "./flags";
import { TenantCache } from "./cache";
import { TokenBuckets } from "./rate-limit";
import { backoffSeconds } from "./jobs";
import { validateSettingValue, SETTINGS_REGISTRY } from "./settings";
import { buildContext, servicePrincipalContext } from "./context";
import { formatInrFromPaise } from "./i18n";

const cal: WorkingCalendar = { workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: new Set(["2026-10-20"]), exceptionsNonWorking: new Set(["2026-10-22"]) };
const ctx = { tenantId: "t", companyId: "c", projectIds: ["p1"], roles: ["planner"], userId: "u" };

describe("error envelope (REQ-CORE-F05)", () => {
  it("maps an AppError to its catalogue status and keeps the reason and field errors", () => {
    const out = toEnvelope(new AppError("VALIDATION_FAILED", "amount is negative", [{ field: "amount", message: "must be 0 or more" }]), "corr-1");
    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({ code: "VALIDATION_FAILED", reason: "amount is negative", correlationId: "corr-1" });
    expect(out.body.fieldErrors).toEqual([{ field: "amount", message: "must be 0 or more" }]);
  });

  it("never leaks the text of an unknown error", () => {
    const out = toEnvelope(new Error("password=hunter2 at 10.0.0.4"), "corr-2");
    expect(out.status).toBe(500);
    expect(JSON.stringify(out.body)).not.toContain("hunter2");
  });

  it("gives every catalogue entry a status, message and action", () => {
    for (const entry of Object.values(ERROR_CATALOGUE)) {
      expect(entry.status).toBeGreaterThanOrEqual(400);
      expect(entry.message.length).toBeGreaterThan(0);
      expect(entry.action.length).toBeGreaterThan(0);
    }
  });
});

describe("calendar (REQ-CORE-F10)", () => {
  it("resolves the financial year and period for an April start", () => {
    expect(financialYear("2026-05-02")).toBe("2026-27");
    expect(financialYear("2027-03-31")).toBe("2026-27");
    expect(financialYear("2027-04-01")).toBe("2027-28");
    expect(periodNumber("2026-04-01")).toBe(1);
    expect(periodNumber("2027-03-31")).toBe(12);
  });

  it("honours a changed fiscal start month", () => {
    expect(financialYear("2026-02-10", 1)).toBe("2026-27");
    expect(periodNumber("2026-01-15", 1)).toBe(1);
  });

  it("counts working days excluding Sundays, holidays and exception days", () => {
    expect(isWorkingDay("2026-10-19", cal)).toBe(true);
    expect(isWorkingDay("2026-10-20", cal)).toBe(false);
    expect(isWorkingDay("2026-10-25", cal)).toBe(false);
    expect(isWorkingDay("2026-10-18", cal)).toBe(false);
    expect(workingDaysBetween("2026-10-19", "2026-10-23", cal)).toBe(2);
    expect(workingDaysBetween("2026-10-23", "2026-10-19", cal)).toBe(-2);
  });

  it("applies a holiday only from its effective date", () => {
    const declared = [{ date: "2026-11-01", validFrom: "2026-10-25" }];
    expect(holidaysEffectiveOn(declared, "2026-10-24").has("2026-11-01")).toBe(false);
    expect(holidaysEffectiveOn(declared, "2026-10-25").has("2026-11-01")).toBe(true);
  });

  it("adds days across month boundaries without time-zone drift", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("feature flags (REQ-CORE-F08)", () => {
  const base: FlagDefinition = { key: "ff.core.sample", owner: "tech-lead", module_code: "core", defaults_by_env: { development: true, production: false }, kill_switch: true };

  it("is off when the flag is unknown", () => {
    expect(isEnabled(undefined, "development", ctx)).toBe(false);
  });

  it("uses the environment default when no target matches", () => {
    expect(isEnabled(base, "development", ctx)).toBe(true);
    expect(isEnabled(base, "production", ctx)).toBe(false);
  });

  it("a kill switch turns the flag off everywhere, including for targeted tenants", () => {
    const killed = { ...base, killed: true, targeting: { tenants: ["t"] } };
    expect(isEnabled(killed, "development", ctx)).toBe(false);
  });

  it("targets by tenant, project and role", () => {
    const flag = { ...base, defaults_by_env: {}, targeting: { projects: ["p1"] } };
    expect(isEnabled(flag, "production", ctx)).toBe(true);
    expect(isEnabled({ ...base, defaults_by_env: {}, targeting: { roles: ["auditor"] } }, "production", ctx)).toBe(false);
  });

  it("buckets a user deterministically", () => {
    expect(bucket("ff.core.sample", "user-1")).toBe(bucket("ff.core.sample", "user-1"));
    expect(bucket("ff.core.sample", "user-1")).toBeGreaterThanOrEqual(0);
    expect(bucket("ff.core.sample", "user-1")).toBeLessThan(100);
  });
});

describe("cache and rate limit (REQ-CORE-F13)", () => {
  it("namespaces keys per tenant and expires entries", () => {
    let now = 0;
    const cache = new TenantCache<string>(1000, () => now);
    cache.set("t1", "k", "a");
    cache.set("t2", "k", "b");
    expect(cache.get("t1", "k")).toBe("a");
    expect(cache.get("t2", "k")).toBe("b");
    now = 1001;
    expect(cache.get("t1", "k")).toBeUndefined();
  });

  it("invalidates a prefix for one tenant only", () => {
    const cache = new TenantCache<string>(60_000);
    cache.set("t1", "settings:a", "1");
    cache.set("t1", "other", "2");
    cache.set("t2", "settings:a", "3");
    expect(cache.invalidatePrefix("t1", "settings:")).toBe(1);
    expect(cache.get("t1", "settings:a")).toBeUndefined();
    expect(cache.get("t1", "other")).toBe("2");
    expect(cache.get("t2", "settings:a")).toBe("3");
  });

  it("limits a subject after its bucket is empty and refills over time", () => {
    let now = 0;
    const buckets = new TokenBuckets({ capacity: 2, refillPerSecond: 1 }, () => now);
    expect(buckets.take("t1:user:1").allowed).toBe(true);
    expect(buckets.take("t1:user:1").allowed).toBe(true);
    expect(buckets.take("t1:user:1").allowed).toBe(false);
    expect(buckets.take("t2:user:1").allowed).toBe(true);
    now = 1000;
    expect(buckets.take("t1:user:1").allowed).toBe(true);
  });
});

describe("jobs and settings", () => {
  it("backs off 30 s, 60 s, 120 s and caps at one hour", () => {
    expect([1, 2, 3].map(backoffSeconds)).toEqual([30, 60, 120]);
    expect(backoffSeconds(20)).toBe(3600);
  });

  it("validates typed setting values against the registry", () => {
    const def = SETTINGS_REGISTRY["core.fiscal.start_month"];
    expect(() => validateSettingValue(def, 4)).not.toThrow();
    expect(() => validateSettingValue(def, 13)).toThrow(AppError);
    expect(() => validateSettingValue(def, "4")).toThrow(AppError);
    expect(() => validateSettingValue(SETTINGS_REGISTRY["core.notifications.quiet_hours"], "yes")).toThrow(AppError);
  });
});

describe("request context (REQ-CORE-F01)", () => {
  const session = { tenantId: "7d6f3c1e-8a3b-4f21-9c55-2a1b0e4d9f10", companyId: "c", projectIds: ["p1"], siteIds: [], userId: "5a9e2d4c-1b7f-4e8a-8d3c-6f0b2a1c9e77", roles: ["planner"], permissionSnapshotVersion: 1, locale: "en-IN", timezone: "Asia/Kolkata" };

  it("refuses a session without a valid tenant or user identifier", () => {
    expect(() => buildContext({ ...session, tenantId: "not-a-uuid" }, "api", "c1")).toThrow(RangeError);
    expect(() => buildContext({ ...session, userId: "" }, "api", "c1")).toThrow(RangeError);
  });

  it("requires a correlation identifier", () => {
    expect(() => buildContext(session, "api", "")).toThrow(RangeError);
  });

  it("gives a job a service principal with sorted explicit permissions", () => {
    const principal = servicePrincipalContext(session.tenantId, "core.sample.run", ["z.write", "a.read"], "corr-job");
    expect(principal.channel).toBe("job");
    expect(principal.permissions).toEqual(["a.read", "z.write"]);
  });
});

describe("money display (REQ-CORE-F11, F16)", () => {
  it("groups Indian rupees in lakhs and crores; the currency symbol is added by the UI", () => {
    expect(formatInrFromPaise(123456789)).toBe("12,34,567.89");
    expect(formatInrFromPaise(100000000000)).toBe("1,00,00,00,000.00");
    expect(formatInrFromPaise(-50)).toBe("-0.50");
  });
});
