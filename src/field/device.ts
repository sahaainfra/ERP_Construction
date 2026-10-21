// Device binding and revocation (Part 14 REQ-FIELD-F15; A-121). The device record lives on the server (the device registry is a server
// table and waits for the session layer, A-87). These rules are the device's side: a revoked or wiped device refuses to send, and its
// queued commands are reported as rejected with the reason, never silently dropped.
import { settle, type Command } from "./commands";

export type DeviceState = "active" | "revoked" | "wiped";

export interface DeviceBinding {
  deviceId: string;
  userId: string;
  sessionId: string;
  state: DeviceState;
  /** Why the device was revoked or wiped, shown to the person and kept in the audit trail. */
  reason?: string;
}

/** A device may send only while it is active and bound to the user who signed in on it. */
export function mayContact(device: DeviceBinding, signedInUserId: string): { allowed: true } | { allowed: false; reason: string } {
  if (device.state !== "active") return { allowed: false, reason: `this device is ${device.state}${device.reason ? `: ${device.reason}` : ""}` };
  if (device.userId !== signedInUserId) return { allowed: false, reason: "this device is bound to another user" };
  return { allowed: true };
}

/** After a revocation, every queued command is reported as rejected with the reason, so the person knows what did not reach the server. */
export function reportRevoked(queue: Command[], device: DeviceBinding): Command[] {
  if (device.state === "active") return queue;
  const reason = `the device was ${device.state}${device.reason ? `: ${device.reason}` : ""}`;
  return queue.reduce<Command[]>((q, c) => (c.status === "accepted" ? q : settle(q, c.id, { status: "rejected", reason })), queue);
}

/** A wipe deletes the local store. The caller removes the vault (`wipeVault`) and the queue; this names what is removed. */
export function wipePlan(device: DeviceBinding): string[] {
  return device.state === "wiped" ? ["vault key", "encrypted records", "command queue", "cached snapshot"] : [];
}
