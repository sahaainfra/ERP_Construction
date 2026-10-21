// Part 14 S4 tests: the sync pass with per-item results and backoff (REQ-FIELD-F11), the 72-hour tolerance, Wi-Fi-only media, the chunked
// resumable upload with hash checks (REQ-FIELD-F10), the conflict framework (REQ-FIELD-F12), and the status model (REQ-FIELD-F13).
import { describe, expect, it } from "vitest";
import { createCommand, enqueue, type Command } from "./commands";
import { registerConflictRule, resolveConflict, ruleFor, type Conflict } from "./conflicts";
import { chunkPlan, CHUNK_BYTES, orderUploads, sha256Hex, uploadMedia, type MediaTransport, type UploadItem } from "./media";
import { globalStatus, recordStatus } from "./status";
import { backoffDelay, eventFor, mayTransfer, runSync, SYNC_BACKOFF, toleranceState, type ItemResult, type SyncTransport } from "./sync";
import type { Bytes } from "./vault";

const now = new Date("2026-10-21T09:00:00+05:30");
const make = (id: string, extra: Partial<Command> = {}): Command => ({ ...createCommand({ id, type: "dpr.line.add", payload: {}, baseVersions: {}, correlationId: `c-${id}` }, now), ...extra });

function serverFor(outcomes: Record<string, ItemResult["outcome"]>, dropOn?: number): { transport: SyncTransport; batches: string[][] } {
  const batches: string[][] = [];
  return {
    batches,
    transport: {
      sendBatch: async (commands) => {
        if (dropOn !== undefined && batches.length === dropOn) throw new Error("connection lost");
        batches.push(commands.map((c) => c.id));
        return commands.map((c) => {
          const outcome = outcomes[c.id] ?? "accepted";
          return outcome === "accepted" ? { id: c.id, outcome } : { id: c.id, outcome, reason: `${outcome} for ${c.id}` };
        });
      },
    },
  };
}

describe("sync pass (REQ-FIELD-F11)", () => {
  it("sends in order, in batches, and accepts every command when the server accepts them", async () => {
    const server = serverFor({});
    const run = await runSync([make("a"), make("b"), make("c")], server.transport, { batchSize: 2, attempt: 0 });
    expect(server.batches).toEqual([["a", "b"], ["c"]]);
    expect(run.queue.map((c) => c.status)).toEqual(["accepted", "accepted", "accepted"]);
    expect(run.retryInMs).toBeUndefined();
  });

  it("a rejected or failing command does not block the others, and each keeps its own reason", async () => {
    const server = serverFor({ b: "rejected", c: "failed" });
    const run = await runSync([make("a"), make("b"), make("c"), make("d")], server.transport, { batchSize: 10, attempt: 0 });
    expect(run.queue.map((c) => [c.id, c.status])).toEqual([["a", "accepted"], ["b", "rejected"], ["c", "failed"], ["d", "accepted"]]);
    expect(run.queue[1].reason).toBe("rejected for b");
    expect(run.retryInMs).toBeDefined();
  });

  it("stops at a dropped connection, keeps the rest queued, and schedules a retry with backoff", async () => {
    const server = serverFor({}, 1);
    const run = await runSync([make("a"), make("b"), make("c")], server.transport, { batchSize: 1, attempt: 2, random: () => 1 });
    expect(run.dropped).toBe(true);
    expect(run.queue.map((c) => c.status)).toEqual(["accepted", "queued", "queued"]);
    expect(run.retryInMs).toBe(SYNC_BACKOFF.baseMs * 4);
  });

  it("gives up on a command after its maximum attempts, and leaves it for a person", async () => {
    const policy = { baseMs: 1, capMs: 1, maxAttempts: 2 };
    let queue = [make("x")];
    for (let i = 0; i < 3; i++) queue = (await runSync(queue, serverFor({ x: "failed" }).transport, { batchSize: 5, attempt: i, policy })).queue;
    expect(queue[0]).toMatchObject({ status: "failed", attempts: 2 });
    const last = await runSync(queue, serverFor({ x: "failed" }).transport, { batchSize: 5, attempt: 9, policy });
    expect(last.retryInMs).toBeUndefined();
  });
});

describe("backoff and tolerance (REQ-FIELD-F11, A-132, A-133)", () => {
  it("doubles the ceiling each attempt, never passes the cap, and rejects a bad attempt number", () => {
    expect(backoffDelay(0, SYNC_BACKOFF, () => 1)).toBe(5_000);
    expect(backoffDelay(3, SYNC_BACKOFF, () => 1)).toBe(40_000);
    expect(backoffDelay(30, SYNC_BACKOFF, () => 1)).toBe(SYNC_BACKOFF.capMs);
    expect(backoffDelay(2, SYNC_BACKOFF, () => 0)).toBe(0);
    expect(() => backoffDelay(-1)).toThrow(RangeError);
  });

  it("keeps a command within the 72-hour tolerance and marks it past after that, without dropping it", () => {
    expect(toleranceState("2026-10-18T09:00:00+05:30", now)).toBe("within");
    expect(toleranceState("2026-10-17T08:00:00+05:30", now)).toBe("past");
    expect(() => toleranceState("yesterday", now)).toThrow(RangeError);
  });

  it("holds media on a metered connection when Wi-Fi only is chosen, and never transfers offline", () => {
    expect(mayTransfer("media", { online: true, type: "cellular" }, true)).toBe(false);
    expect(mayTransfer("media", { online: true, type: "wifi" }, true)).toBe(true);
    expect(mayTransfer("media", { online: true, type: "cellular" }, false)).toBe(true);
    expect(mayTransfer("command", { online: true, type: "cellular" }, true)).toBe(true);
    expect(mayTransfer("command", { online: false }, false)).toBe(false);
  });

  it("names the event each outcome produces, in the pattern of the event catalogue", () => {
    expect(eventFor({ id: "a", outcome: "accepted" })).toBe("field.command.accepted");
    expect(eventFor({ id: "a", outcome: "rejected", reason: "x" })).toBe("field.command.rejected");
    expect(eventFor({ id: "a", outcome: "conflict", reason: "x" })).toBe("field.conflict.raised");
    expect(eventFor({ id: "a", outcome: "failed", reason: "x" })).toBeNull();
  });

  it("keeps queued commands in order and reports the status at each point", async () => {
    let queue: Command[] = [];
    const captured = ["09:00", "12:00", "17:00"].map((t, i) => make(`dpr-${i}`, { deviceTime: `2026-10-18T${t}:00+05:30` }));
    for (const c of captured) queue = enqueue(queue, c);
    expect(globalStatus(queue.map((c) => recordStatus({ online: false, commandStatuses: [c.status] })))).toBe("offline");
    const run = await runSync(queue, serverFor({}).transport, { batchSize: 10, attempt: 0 });
    expect(run.queue.map((c) => c.id)).toEqual(["dpr-0", "dpr-1", "dpr-2"]);
    expect(globalStatus(run.queue.map((c) => recordStatus({ online: true, commandStatuses: [c.status] })))).toBe("synced");
  });
});

// A test server: holds the bytes it has accepted and checks each chunk's hash before it counts.
function memoryServer(options: { dropAfter?: number; corruptAt?: number } = {}) {
  const held = new Map<string, Uint8Array[]>();
  let calls = 0;
  const transport: MediaTransport = {
    offset: async (id) => (held.get(id) ?? []).reduce((n, c) => n + c.length, 0),
    sendChunk: async (id, offset, bytes, sha) => {
      calls++;
      if (options.dropAfter !== undefined && calls > options.dropAfter) throw new Error("connection lost");
      const sent = options.corruptAt === calls ? new Uint8Array(bytes.map((b, i) => (i === 0 ? b ^ 1 : b))) : bytes;
      if ((await sha256Hex(sent)) !== sha) return { acceptedBytes: offset };
      held.set(id, [...(held.get(id) ?? []), bytes]);
      return { acceptedBytes: offset + bytes.length };
    },
    complete: async () => undefined,
  };
  return { transport, held };
}

const sample = (size: number): Bytes => new Uint8Array(Array.from({ length: size }, (_, i) => i % 251)) as Bytes;

describe("media upload (REQ-FIELD-F10, A-134)", () => {
  it("plans chunks that cover the file exactly, with a short last chunk", () => {
    const plan = chunkPlan(CHUNK_BYTES * 2 + 10);
    expect(plan).toHaveLength(3);
    expect(plan[2]).toEqual({ offset: CHUNK_BYTES * 2, length: 10 });
    expect(plan.reduce((n, p) => n + p.length, 0)).toBe(CHUNK_BYTES * 2 + 10);
  });

  it("uploads a file whole, and the server holds the same bytes", async () => {
    const server = memoryServer();
    const data = sample(CHUNK_BYTES + 100);
    expect(await uploadMedia("up-1", data, server.transport)).toEqual({ status: "complete" });
    const held = Buffer.concat((server.held.get("up-1") ?? []).map((c) => Buffer.from(c)));
    expect(held.equals(Buffer.from(data))).toBe(true);
  });

  it("resumes from the last accepted byte after a dropped connection, without resending what was accepted", async () => {
    const server = memoryServer({ dropAfter: 2 });
    const data = sample(CHUNK_BYTES * 3);
    const first = await uploadMedia("up-2", data, server.transport);
    expect(first).toEqual({ status: "paused", offset: CHUNK_BYTES * 2, reason: "the connection dropped" });
    const healed = memoryServer();
    healed.held.set("up-2", server.held.get("up-2")!);
    expect(await uploadMedia("up-2", data, healed.transport)).toEqual({ status: "complete" });
    expect(healed.held.get("up-2")!.length).toBe(3);
  });

  it("pauses when the server refuses a chunk whose hash does not match, and keeps what was accepted", async () => {
    const server = memoryServer({ corruptAt: 2 });
    const data = sample(CHUNK_BYTES * 2);
    expect(await uploadMedia("up-3", data, server.transport)).toEqual({ status: "paused", offset: CHUNK_BYTES, reason: "the server refused a chunk" });
  });

  it("orders uploads by priority, then by age", () => {
    const items: UploadItem[] = [
      { id: "bulk", bytes: sample(1), priority: 1, createdAt: "2026-10-18T09:00:00Z" },
      { id: "safety", bytes: sample(1), priority: 5, createdAt: "2026-10-19T09:00:00Z" },
      { id: "old", bytes: sample(1), priority: 1, createdAt: "2026-10-17T09:00:00Z" },
    ];
    expect(orderUploads(items).map((i) => i.id)).toEqual(["safety", "old", "bulk"]);
  });
});

describe("conflicts (REQ-FIELD-F12, A-120)", () => {
  const dprConflict = (entity: string): Conflict => ({
    id: "k-1",
    entity,
    entityId: "DPR-9",
    serverVersion: { status: "approved", qty: 40 },
    localVersion: { status: "draft", qty: 42 },
    serverRecordVersion: 7,
    baseRecordVersion: 6,
  });
  registerConflictRule("dpr", { locked: (v) => v.status === "approved" });
  registerConflictRule("material_request", { locked: () => false });

  it("keeps the server version when the person chooses it", () => {
    expect(resolveConflict(dprConflict("dpr"), "keep_server")).toEqual({ action: "use_server" });
  });

  it("turns 'keep mine' on a locked record into an amendment request, never an overwrite", () => {
    expect(resolveConflict(dprConflict("dpr"), "keep_mine")).toMatchObject({ action: "amendment_request" });
  });

  it("re-bases 'keep mine' on an unlocked record on the current server version", () => {
    expect(resolveConflict(dprConflict("material_request"), "keep_mine")).toEqual({ action: "apply_local", baseRecordVersion: 7 });
  });

  it("refuses an entity with no registered rule rather than guessing", () => {
    expect(() => ruleFor("payment")).toThrow(RangeError);
    expect(() => resolveConflict(dprConflict("payment"), "keep_mine")).toThrow(RangeError);
  });
});

describe("status model (REQ-FIELD-F13)", () => {
  it("shows the most serious state for a record and for the device", () => {
    expect(recordStatus({ online: true, commandStatuses: ["accepted"] })).toBe("synced");
    expect(recordStatus({ online: true, commandStatuses: ["queued"] })).toBe("queued");
    expect(recordStatus({ online: false, commandStatuses: ["queued"] })).toBe("offline");
    expect(recordStatus({ online: true, commandStatuses: ["sent"] })).toBe("syncing");
    expect(recordStatus({ online: true, commandStatuses: ["failed", "queued"] })).toBe("failed");
    expect(recordStatus({ online: true, commandStatuses: ["conflict", "failed"] })).toBe("conflict");
    expect(globalStatus(["synced", "syncing", "offline"])).toBe("syncing");
    expect(globalStatus(["synced", "queued"])).toBe("queued");
    expect(globalStatus([])).toBe("synced");
  });
});
