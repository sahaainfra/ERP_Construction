// File-storage abstraction (Part 05 REQ-CORE-F12). The local adapter is for development and tests. Object storage, signed
// URLs and server-side encryption need a provider (CF-012, CF-027) and are not implemented here.
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { AppError } from "./errors";

export interface StoredObject {
  key: string;
  sha256: string;
  size: number;
}

export interface ObjectStorage {
  put(key: string, data: Buffer): Promise<StoredObject>;
  get(key: string): Promise<{ data: Buffer; object: StoredObject }>;
}

/** Keys are lower-case paths with one extension, for example "tenant-a/drawing/2026/rev-b.pdf". No dots in directories. */
export const OBJECT_KEY = /^[a-z0-9][a-z0-9_-]{0,80}(\/[a-z0-9][a-z0-9_-]{0,80}){0,5}\.[a-z0-9]{1,10}$/;

export class LocalObjectStorage implements ObjectStorage {
  constructor(private readonly root: string, private readonly maxBytes = 25 * 1024 * 1024) {}

  private pathFor(key: string): string {
    if (!OBJECT_KEY.test(key)) throw new AppError("VALIDATION_FAILED", "object key is not allowed", [{ field: "key", message: "lower-case path with one extension" }]);
    const full = resolve(this.root, key);
    if (!full.startsWith(resolve(this.root) + sep)) throw new AppError("VALIDATION_FAILED", "object key leaves the storage root");
    return full;
  }

  /** Stores an immutable object. An existing key is refused, never overwritten. */
  async put(key: string, data: Buffer): Promise<StoredObject> {
    const path = this.pathFor(key);
    if (data.length === 0 || data.length > this.maxBytes) {
      throw new AppError("VALIDATION_FAILED", "object size is outside the allowed range", [{ field: "size", message: `1 to ${this.maxBytes} bytes` }]);
    }
    if (await exists(path)) throw new AppError("CONFLICT", "an object with this key already exists");
    const object: StoredObject = { key, sha256: createHash("sha256").update(data).digest("hex"), size: data.length };
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, data, { flag: "wx" });
    await writeFile(`${temp}.meta`, JSON.stringify(object), { flag: "wx" });
    await rename(`${temp}.meta`, `${path}.meta.json`);
    await rename(temp, path);
    return object;
  }

  /** Reads an object and checks its hash against the recorded value. A mismatch is an integrity failure, not a not-found. */
  async get(key: string): Promise<{ data: Buffer; object: StoredObject }> {
    const path = this.pathFor(key);
    const [data, meta] = await Promise.all([readFile(path), readFile(`${path}.meta.json`, "utf8")]);
    const object = JSON.parse(meta) as StoredObject;
    const actual = createHash("sha256").update(data).digest("hex");
    if (actual !== object.sha256 || data.length !== object.size) {
      throw new Error("object integrity check failed");
    }
    return { data, object };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
