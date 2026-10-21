// Part 14 S3 tests: the encrypted vault and its key lifecycle (REQ-FIELD-F07, A-116), the command queue and base-version rule
// (REQ-FIELD-F08), the freshness and scope rules (REQ-FIELD-F14), and the Ed25519 snapshot check (REQ-FIELD-F09, A-130).
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCommand, enqueue, nextToSend, settle, staleRecords, type Command } from "./commands";
import { canonicalJson, freshness, importSigningKey, scopeRecords, signingSupported, verifySnapshot } from "./snapshot";
import { Vault, VaultLockedError, createMemoryBackend, deriveKek, provisionVault, unlockVault, wipeVault } from "./vault";

const SALT = new Uint8Array(16).fill(7);
const sessionA = new Uint8Array(randomBytes(32));
const sessionB = new Uint8Array(randomBytes(32));

describe("encrypted vault (REQ-FIELD-F07, A-116)", () => {
  it("stores and reads a record once unlocked with the session key", async () => {
    const backend = createMemoryBackend();
    await provisionVault(backend, await deriveKek(sessionA, SALT));
    const vault = await unlockVault(backend, await deriveKek(sessionA, SALT));
    await vault.put("dpr", "DPR-1", { site: "27", note: "Pour complete" });
    expect(await vault.get("dpr", "DPR-1")).toEqual({ site: "27", note: "Pour complete" });
    expect(await vault.get("dpr", "missing")).toBeUndefined();
  });

  it("keeps the record unreadable on the device: the stored bytes do not contain the plaintext", async () => {
    const backend = createMemoryBackend();
    await provisionVault(backend, await deriveKek(sessionA, SALT));
    const vault = await unlockVault(backend, await deriveKek(sessionA, SALT));
    await vault.put("dpr", "DPR-2", { note: "very distinctive text 91827" });
    const raw = Buffer.from((await backend.get("record/dpr/DPR-2"))!).toString("latin1");
    expect(raw).not.toContain("distinctive");
  });

  it("refuses to unlock with another session's key, and refuses when the key has been removed", async () => {
    const backend = createMemoryBackend();
    await provisionVault(backend, await deriveKek(sessionA, SALT));
    await expect(unlockVault(backend, await deriveKek(sessionB, SALT))).rejects.toBeInstanceOf(VaultLockedError);
    await wipeVault(backend);
    await expect(unlockVault(backend, await deriveKek(sessionA, SALT))).rejects.toBeInstanceOf(VaultLockedError);
  });

  it("makes stored records unreadable at once when the key is deleted, even if the records remain", async () => {
    const backend = createMemoryBackend();
    await provisionVault(backend, await deriveKek(sessionA, SALT));
    const vault: Vault = await unlockVault(backend, await deriveKek(sessionA, SALT));
    await vault.put("dpr", "DPR-3", { note: "kept until wipe" });
    await backend.delete("vault/key");
    await expect(unlockVault(backend, await deriveKek(sessionA, SALT))).rejects.toBeInstanceOf(VaultLockedError);
    expect(await backend.get("record/dpr/DPR-3")).toBeDefined();
    await wipeVault(backend);
    expect(await backend.get("record/dpr/DPR-3")).toBeUndefined();
  });

  it("refuses a record moved to another id, because the id is bound into the ciphertext", async () => {
    const backend = createMemoryBackend();
    await provisionVault(backend, await deriveKek(sessionA, SALT));
    const vault = await unlockVault(backend, await deriveKek(sessionA, SALT));
    await vault.put("dpr", "DPR-4", { amount: 100 });
    await backend.put("record/dpr/DPR-5", (await backend.get("record/dpr/DPR-4"))!);
    await expect(vault.get("dpr", "DPR-5")).rejects.toThrow();
  });

  it("refuses a record whose bytes were changed", async () => {
    const backend = createMemoryBackend();
    await provisionVault(backend, await deriveKek(sessionA, SALT));
    const vault = await unlockVault(backend, await deriveKek(sessionA, SALT));
    await vault.put("dpr", "DPR-6", { amount: 100 });
    const stored = (await backend.get("record/dpr/DPR-6"))!;
    stored[stored.length - 1] ^= 0x01;
    await expect(vault.get("dpr", "DPR-6")).rejects.toThrow();
  });
});

describe("command queue (REQ-FIELD-F08, A-119)", () => {
  const now = new Date("2026-10-21T09:00:00+05:30");
  const make = (id: string, base: Record<string, number> = { "PO-7": 3 }): Command =>
    createCommand({ id, type: "po.line.receive", payload: { qty: 4 }, baseVersions: base, correlationId: `corr-${id}` }, now);

  it("keeps each command once by its UUID, so a retry cannot duplicate an action", () => {
    const queue = enqueue(enqueue([], make("c-1")), make("c-1"));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ status: "queued", deviceTime: now.toISOString() });
  });

  it("sends in the order the person made them, and skips commands already settled", () => {
    let queue = [make("c-1"), make("c-2"), make("c-3")];
    expect(nextToSend(queue)?.id).toBe("c-1");
    queue = settle(queue, "c-1", { status: "accepted" });
    expect(nextToSend(queue)?.id).toBe("c-2");
  });

  it("reports a rejection with its reason rather than dropping the command", () => {
    const queue = settle([make("c-9")], "c-9", { status: "rejected", reason: "the PO changed" });
    expect(queue[0]).toMatchObject({ status: "rejected", reason: "the PO changed" });
  });

  it("finds the records that moved since the person based the command on them", () => {
    expect(staleRecords({ "PO-7": 4 }, { "PO-7": 3 })).toEqual(["PO-7"]);
    expect(staleRecords({ "PO-7": 3, "WA-2": 1 }, { "PO-7": 3 })).toEqual([]);
    expect(staleRecords({}, { "PO-7": 3 })).toEqual(["PO-7"]);
  });

  it("refuses a command with no id or type", () => {
    expect(() => createCommand({ id: "", type: "x", payload: {}, baseVersions: {}, correlationId: "c" }, now)).toThrow(RangeError);
  });
});

describe("freshness and scope (REQ-FIELD-F14, A-117, A-129)", () => {
  const ages = { softHours: 24, hardHours: 72 };
  const generated = "2026-10-20T09:00:00Z";
  it("is fresh before the soft age, warns after it, and blocks after the hard age", () => {
    expect(freshness(generated, new Date("2026-10-20T20:00:00Z"), ages)).toBe("fresh");
    expect(freshness(generated, new Date("2026-10-21T10:00:00Z"), ages)).toBe("warn");
    expect(freshness(generated, new Date("2026-10-23T09:00:00Z"), ages)).toBe("blocked");
  });
  it("refuses ages it has not been given, or a hard age not longer than the soft one", () => {
    expect(() => freshness(generated, new Date(), { softHours: 24, hardHours: 24 })).toThrow(RangeError);
    expect(() => freshness(generated, new Date(), { softHours: 0, hardHours: 72 })).toThrow(RangeError);
    expect(() => freshness("not a date", new Date(), ages)).toThrow(RangeError);
  });
  it("keeps only the records of the sites the viewer may see", () => {
    const records = [{ id: 1, siteId: "27" }, { id: 2, siteId: "29" }, { id: 3, siteId: "27" }];
    expect(scopeRecords(records, ["27"]).map((r) => r.id)).toEqual([1, 3]);
    expect(scopeRecords(records, [])).toEqual([]);
  });
});

describe("signed authorisations (REQ-FIELD-F09, A-130)", () => {
  const payload = { workAuthorisation: "WA-17", site: "27", validUntil: "2026-10-22", limits: { concrete: 40 } };

  it("accepts a snapshot signed with the matching key, whatever the key order in the payload", async () => {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(canonicalJson(payload))));
    const key = await importSigningKey(raw);
    expect(await verifySnapshot(payload, signature, key)).toBe(true);
    expect(await verifySnapshot({ limits: { concrete: 40 }, validUntil: "2026-10-22", site: "27", workAuthorisation: "WA-17" }, signature, key)).toBe(true);
  });

  it("refuses a snapshot whose content was changed after signing", async () => {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(canonicalJson(payload))));
    const key = await importSigningKey(raw);
    expect(await verifySnapshot({ ...payload, limits: { concrete: 400 } }, signature, key)).toBe(false);
  });

  it("reports whether this browser can check signatures at all", async () => {
    expect(typeof (await signingSupported())).toBe("boolean");
  });
});
