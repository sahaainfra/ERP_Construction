// Pure tests for the remaining Part 05 services: hook contract, client helpers, storage adapter, log redaction.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createScopeStore, can, newIdempotencyKey, requestHeaders, userMessage } from "./client";
import { controlled, controlledMethods, declareControlled, validateControlled } from "./hooks";
import { redact } from "./logger";
import { LocalObjectStorage } from "./storage";
import { AppError, toEnvelope } from "./errors";

describe("hook contract (REQ-CORE-F02; CP-CORE-01)", () => {
  const good = { name: "core.sample.create", trigger: "api.post", stages: ["authorize", "validate", "protocol.check", "persist", "audit", "emit"] as const };

  it("accepts a declaration with authorisation, the protocol check and persistence in order", () => {
    expect(validateControlled({ ...good, stages: [...good.stages] })).toEqual([]);
  });

  it("refuses a declaration that skips the protocol check or authorisation", () => {
    expect(validateControlled({ ...good, stages: ["authorize", "persist"] }).join(" ")).toContain("missing required stage protocol.check");
    expect(validateControlled({ ...good, stages: ["protocol.check", "persist"] }).join(" ")).toContain("missing required stage authorize");
  });

  it("refuses a protocol check or authorisation that runs after the write", () => {
    expect(validateControlled({ ...good, stages: ["persist", "authorize", "protocol.check"] }).join(" ")).toContain("must run before persist");
  });

  it("refuses unknown stages, repeated stages and an empty trigger", () => {
    const problems = validateControlled({ name: "core.x.y", trigger: " ", stages: ["authorize", "authorize", "protocol.check", "persist", "magic"] as never });
    expect(problems.join(" ")).toMatch(/unknown stage magic/);
    expect(problems.join(" ")).toMatch(/appears twice/);
    expect(problems.join(" ")).toMatch(/trigger is required/);
  });

  it("registers a controlled method once and lists it", () => {
    const fn = controlled({ name: "core.test.hookdemo", trigger: "job.run", stages: good.stages }, () => 1);
    expect(fn()).toBe(1);
    expect(controlledMethods().map((m) => m.name)).toContain("core.test.hookdemo");
    expect(() => declareControlled({ name: "core.test.hookdemo", trigger: "job.run", stages: good.stages })).toThrow(/already declared/);
  });
});

describe("client helpers (REQ-CORE-F18)", () => {
  it("sends the correlation header always and the idempotency header only for writes", () => {
    expect(requestHeaders({ correlationId: "c-1" })).toEqual({ "X-Correlation-Id": "c-1" });
    expect(requestHeaders({ correlationId: "c-1", idempotencyKey: "k-1" })).toEqual({ "X-Correlation-Id": "c-1", "Idempotency-Key": "k-1" });
  });

  it("creates distinct idempotency keys", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it("checks a permission against a set or a list", () => {
    expect(can(new Set(["po.approve"]), "po.approve")).toBe(true);
    expect(can(["po.view"], "po.approve")).toBe(false);
  });

  it("turns an error envelope into a message in the user's locale, with the catalogue action", () => {
    const { body } = toEnvelope(new AppError("VALIDATION_FAILED", "amount is negative", [{ field: "amount", message: "0 or more" }]), "c-9");
    const en = userMessage(body, "en-IN");
    expect(en.title).toBe("Some values are not valid.");
    expect(en.fieldErrors).toEqual([{ field: "amount", message: "0 or more" }]);
    expect(en.correlationId).toBe("c-9");
    expect(userMessage(body, "hi-IN").title).not.toBe(en.title);
  });

  it("falls back to the catalogue for an unknown code, never to server text", () => {
    const out = userMessage({ code: "SOMETHING_NEW", message: "db password leaked", reason: "x", action: "y", fieldErrors: [], correlationId: "c" }, "en-IN");
    expect(JSON.stringify(out)).not.toContain("leaked");
  });

  it("keeps the work scope and notifies subscribers when it changes", () => {
    const store = createScopeStore();
    const seen: (string | null)[] = [];
    const off = store.subscribe((s) => seen.push(s.projectId));
    store.set({ projectId: "p1" });
    off();
    store.set({ projectId: "p2" });
    expect(seen).toEqual(["p1"]);
    expect(store.get().projectId).toBe("p2");
  });
});

describe("log redaction (REQ-CORE-F06)", () => {
  it("removes secret-like and personal-identifier keys at any depth and keeps other values", () => {
    const out = redact({ user: "u1", password: "x", nested: { apiKey: "k", phone: "9999", amount: 10 }, list: [{ email: "a@b.c", ok: true }] });
    expect(out).toEqual({ user: "u1", password: "[redacted]", nested: { apiKey: "[redacted]", phone: "[redacted]", amount: 10 }, list: [{ email: "[redacted]", ok: true }] });
  });
});

describe("local object storage (REQ-CORE-F12)", () => {
  let root: string;
  let storage: LocalObjectStorage;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "erp-storage-"));
    storage = new LocalObjectStorage(root, 1024);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores an object with its hash and reads it back intact", async () => {
    const data = Buffer.from("drawing revision B");
    const stored = await storage.put("tenant-a/drawing/rev-b.pdf", data);
    expect(stored.size).toBe(data.length);
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    const read = await storage.get("tenant-a/drawing/rev-b.pdf");
    expect(read.data.equals(data)).toBe(true);
    expect(read.object).toEqual(stored);
  });

  it("never overwrites an existing object", async () => {
    await storage.put("tenant-a/once.txt", Buffer.from("first"));
    await expect(storage.put("tenant-a/once.txt", Buffer.from("second"))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses keys that leave the root or break the allowed shape", async () => {
    for (const key of ["../escape.txt", "/etc/passwd", "Upper/Case.pdf", "no-extension", "a/../../b.txt"]) {
      await expect(storage.put(key, Buffer.from("x"))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
  });

  it("refuses an empty or oversized object", async () => {
    await expect(storage.put("tenant-a/empty.txt", Buffer.alloc(0))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(storage.put("tenant-a/big.bin", Buffer.alloc(2048))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("reports an integrity failure when the stored bytes no longer match their hash", async () => {
    await storage.put("tenant-a/tamper.txt", Buffer.from("original"));
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(root, "tenant-a/tamper.txt"), "changed");
    await expect(storage.get("tenant-a/tamper.txt")).rejects.toThrow("integrity check failed");
  });
});

describe("error code reference (REQ-CORE-F05)", () => {
  it("keeps ERROR_CODES.md identical to the catalogue", async () => {
    const { readFileSync } = await import("node:fs");
    const { renderErrorCodes } = await import("./error-docs");
    const doc = readFileSync(join(__dirname, "../../docs/erp-program/ERROR_CODES.md"), "utf8");
    expect(doc).toBe(renderErrorCodes());
  });
});
