// Part 11 S1 pure tests: host names, address ranges, destination checks (with an injected resolver), the breaker and mapping rules.
import { describe, expect, it } from "vitest";
import { checkDestination, hostProblem, isPrivateAddress } from "./ssrf";
import { CircuitBreaker } from "./breaker";
import { mappingProblems } from "./mappings";

describe("host names (REQ-INTG-F01)", () => {
  it("accepts a plain DNS name and refuses wildcards, IP literals, upper case and single labels", () => {
    expect(hostProblem("api.example.in")).toBeNull();
    expect(hostProblem("*.example.in")).not.toBeNull();
    expect(hostProblem("10.0.0.1")).toMatch(/IP addresses/);
    expect(hostProblem("Example.in")).toMatch(/lower case/);
    expect(hostProblem("localhost")).not.toBeNull();
  });
});

describe("private and reserved addresses (A-59)", () => {
  it("refuses private, loopback, link-local, shared and multicast IPv4 and their IPv6 forms", () => {
    for (const a of ["10.1.2.3", "127.0.0.1", "169.254.1.1", "172.20.0.1", "192.168.1.1", "100.64.0.1", "224.0.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const a of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"]) {
      expect(isPrivateAddress(a), a).toBe(false);
    }
  });
});

describe("destination checks (A-59)", () => {
  const allowed = ["api.example.in"];
  const publicResolver = async () => ["93.184.216.34"];
  it("allows an https call to an allow-listed host that resolves to a public address", async () => {
    await expect(checkDestination("https://api.example.in/v1/items", allowed, publicResolver)).resolves.toBeInstanceOf(URL);
  });
  it("refuses http, unlisted hosts, credentials in the URL, and names that resolve to private addresses", async () => {
    await expect(checkDestination("http://api.example.in/", allowed, publicResolver)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(checkDestination("https://evil.example.in/", allowed, publicResolver)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(checkDestination("https://user:pw@api.example.in/", allowed, publicResolver)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(checkDestination("https://api.example.in/", allowed, async () => ["10.0.0.5"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(checkDestination("https://api.example.in/", allowed, async () => ["93.184.216.34", "192.168.0.9"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(checkDestination("not a url", allowed, publicResolver)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
  it("refuses a name that does not resolve", async () => {
    await expect(checkDestination("https://api.example.in/", allowed, async () => { throw new Error("ENOTFOUND"); })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("circuit breaker (plan §2.1 option (a))", () => {
  function clock(start = 0) {
    let t = start;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
  }
  it("opens after the threshold within the window, refuses while open, admits one probe after cooldown, and closes on success", () => {
    const c = clock();
    const b = new CircuitBreaker({ threshold: 3, windowMs: 1000, cooldownMs: 500 }, c.now);
    expect(b.failure()).toBe(false);
    expect(b.failure()).toBe(false);
    expect(b.failure()).toBe(true);
    expect(b.current()).toBe("open");
    expect(b.allow()).toBe(false);
    c.advance(500);
    expect(b.allow()).toBe(true);
    expect(b.allow()).toBe(false);
    b.success();
    expect(b.current()).toBe("closed");
    expect(b.allow()).toBe(true);
  });
  it("re-opens when the probe fails, and counts only failures inside the window", () => {
    const c = clock();
    const b = new CircuitBreaker({ threshold: 2, windowMs: 1000, cooldownMs: 500 }, c.now);
    b.failure();
    c.advance(2000);
    expect(b.failure()).toBe(false);
    expect(b.failure()).toBe(true);
    c.advance(500);
    expect(b.allow()).toBe(true);
    expect(b.failure()).toBe(true);
    expect(b.current()).toBe("open");
  });
});

describe("mapping rules (REQ-INTG-F03)", () => {
  const base = { connectorCode: "bank_sftp", entity: "bank_code" as const, erpCode: "HDFC", extCode: "HDFC0000001", reason: "Bank code for the payment file" };
  it("accepts a valid mapping", () => {
    expect(mappingProblems(base)).toEqual([]);
  });
  it("refuses an unknown entity, padded codes, control characters and a short reason", () => {
    expect(mappingProblems({ ...base, entity: "invoice" as never })).toEqual([expect.objectContaining({ field: "entity" })]);
    expect(mappingProblems({ ...base, erpCode: " HDFC" })).toEqual([expect.objectContaining({ field: "erpCode" })]);
    expect(mappingProblems({ ...base, extCode: "A\nB" })).toEqual([expect.objectContaining({ field: "extCode" })]);
    expect(mappingProblems({ ...base, reason: "short" })).toEqual([expect.objectContaining({ field: "reason" })]);
  });
});
