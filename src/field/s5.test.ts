// Part 14 S5 tests: device binding and revocation (REQ-FIELD-F15, A-121), the offline-capability registry with the online-only list
// (REQ-FIELD-F16, A-135), and diagnostics with consent and redaction (REQ-FIELD-F17, CP-FIELD-05, A-136).
import { describe, expect, it } from "vitest";
import { createCommand, settle, type Command } from "./commands";
import { offlineAllowed } from "./capabilities";
import { exportSyncLog, queueTelemetry } from "./diagnostics";
import { mayContact, reportRevoked, wipePlan, type DeviceBinding } from "./device";

const now = new Date("2026-10-21T09:00:00+05:30");
const device = (extra: Partial<DeviceBinding> = {}): DeviceBinding => ({ deviceId: "dev-1", userId: "ACME00042", sessionId: "s-1", state: "active", ...extra });
const cmd = (id: string, deviceTime = now.toISOString()): Command => createCommand({ id, type: "dpr.line.add", payload: {}, baseVersions: {}, correlationId: `c-${id}`, deviceTime }, now);

describe("device binding and revocation (REQ-FIELD-F15, A-121)", () => {
  it("lets an active device bound to the signed-in user contact the server", () => {
    expect(mayContact(device(), "ACME00042")).toEqual({ allowed: true });
  });

  it("refuses a revoked or wiped device, with the reason", () => {
    expect(mayContact(device({ state: "revoked", reason: "lost in transit" }), "ACME00042")).toEqual({ allowed: false, reason: "this device is revoked: lost in transit" });
    expect(mayContact(device({ state: "wiped" }), "ACME00042")).toEqual({ allowed: false, reason: "this device is wiped" });
  });

  it("refuses a device signed in by a different user", () => {
    expect(mayContact(device(), "ACME00099")).toMatchObject({ allowed: false });
  });

  it("reports a revoked device's queued commands as rejected with the reason, and leaves accepted ones alone", () => {
    const queue = settle([cmd("a"), cmd("b")], "a", { status: "accepted" });
    const reported = reportRevoked(queue, device({ state: "revoked", reason: "lost" }));
    expect(reported.map((c) => [c.id, c.status])).toEqual([["a", "accepted"], ["b", "rejected"]]);
    expect(reported[1].reason).toBe("the device was revoked: lost");
  });

  it("leaves the queue unchanged for an active device", () => {
    const queue = [cmd("a")];
    expect(reportRevoked(queue, device())).toBe(queue);
  });

  it("names everything a wipe removes", () => {
    expect(wipePlan(device({ state: "wiped" }))).toEqual(["vault key", "encrypted records", "command queue", "cached snapshot"]);
    expect(wipePlan(device())).toEqual([]);
  });
});

describe("offline-capability registry (REQ-FIELD-F16, A-135)", () => {
  it("allows the field actions that are safe to queue", () => {
    expect(offlineAllowed("dpr.line.add")).toEqual({ allowed: true });
    expect(offlineAllowed("punch.record")).toEqual({ allowed: true });
  });

  it("refuses the online-only actions when submitted offline, with the reason", () => {
    expect(offlineAllowed("payment.release")).toEqual({ allowed: false, reason: "payments are released online only" });
    expect(offlineAllowed("stock.post")).toMatchObject({ allowed: false });
    expect(offlineAllowed("permission.change")).toMatchObject({ allowed: false });
  });

  it("refuses an action that is not registered, rather than guessing", () => {
    expect(offlineAllowed("made.up.action")).toEqual({ allowed: false, reason: "this action is not registered for offline use" });
  });
});

describe("diagnostics (REQ-FIELD-F17, CP-FIELD-05, A-136)", () => {
  const entries = [
    { at: "2026-10-21T09:00:00Z", correlationId: "corr-1", event: "field.command.rejected", detail: { reason: "the PO changed", phone: "9876543210", authorization: "Bearer abc.def.ghi" } },
  ];

  it("refuses to export without the person's consent", () => {
    expect(() => exportSyncLog(entries, false)).toThrow();
  });

  it("exports with correlation ids and without personal or secret values", () => {
    const out = exportSyncLog(entries, true);
    expect(out).toContain("corr-1");
    expect(out).toContain("the PO changed");
    expect(out).not.toContain("9876543210");
    expect(out).not.toContain("abc.def.ghi");
  });

  it("counts stale and repeatedly rejected commands without any record content", () => {
    const rejected = (id: string) => settle([cmd(id)], id, { status: "rejected", reason: "stale base" })[0];
    const queue: Command[] = [
      cmd("q1", "2026-10-17T08:00:00+05:30"),
      cmd("q2"),
      rejected("r1"),
      rejected("r2"),
      rejected("r3"),
    ];
    expect(queueTelemetry(queue, now)).toEqual({ queued: 2, past72Hours: 1, rejected: 3, repeatedRejections: 3 });
  });
});
