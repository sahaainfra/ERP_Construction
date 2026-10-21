// Media upload (Part 14 REQ-FIELD-F10; A-134). Chunked and resumable: the upload asks the server where it stopped, sends the rest in
// chunks, and checks each chunk's SHA-256 on the server before it counts. A dropped connection resumes from the last accepted byte.
// The transport is injected and the tests use an in-memory adapter; no storage has been chosen (§2.3), so nothing is uploaded to
// production storage by this code.
import type { Bytes } from "./vault";

export const CHUNK_BYTES = 512 * 1024;

export interface UploadItem {
  id: string;
  bytes: Bytes;
  /** Higher priority is sent first. Ties go to the older item. */
  priority: number;
  createdAt: string;
}

export interface MediaTransport {
  /** The byte offset the server already holds for this upload. */
  offset(uploadId: string): Promise<number>;
  /** Sends one chunk. The server returns how many bytes it accepted after checking the hash. */
  sendChunk(uploadId: string, offset: number, bytes: Bytes, sha256: string): Promise<{ acceptedBytes: number }>;
  /** Asks the server to check the whole file against its hash and close the upload. */
  complete(uploadId: string, sha256: string): Promise<void>;
}

export async function sha256Hex(bytes: Bytes): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function chunkPlan(size: number, chunk: number = CHUNK_BYTES): { offset: number; length: number }[] {
  const plan: { offset: number; length: number }[] = [];
  for (let offset = 0; offset < size; offset += chunk) plan.push({ offset, length: Math.min(chunk, size - offset) });
  return plan;
}

/** Highest priority first, then the oldest. Used by the sync pass so important photos go before bulk items. */
export function orderUploads(items: UploadItem[]): UploadItem[] {
  return [...items].sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
}

export type UploadResult = { status: "complete" } | { status: "paused"; offset: number; reason: string };

/** Sends the rest of one file. Pauses, without losing progress, when a chunk is refused or the connection drops. */
export async function uploadMedia(uploadId: string, bytes: Bytes, transport: MediaTransport): Promise<UploadResult> {
  let offset = await transport.offset(uploadId);
  if (offset < 0 || offset > bytes.length) throw new RangeError("the server reports an offset outside the file");
  if (offset % CHUNK_BYTES !== 0 && offset !== bytes.length) throw new RangeError("the server offset is not on a chunk boundary");
  for (const piece of chunkPlan(bytes.length).filter((p) => p.offset >= offset)) {
    const chunk = bytes.slice(piece.offset, piece.offset + piece.length);
    const sha = await sha256Hex(chunk);
    let accepted: number;
    try {
      ({ acceptedBytes: accepted } = await transport.sendChunk(uploadId, piece.offset, chunk, sha));
    } catch {
      return { status: "paused", offset, reason: "the connection dropped" };
    }
    if (accepted !== piece.offset + piece.length) return { status: "paused", offset: accepted, reason: "the server refused a chunk" };
    offset = accepted;
  }
  await transport.complete(uploadId, await sha256Hex(bytes));
  return { status: "complete" };
}
