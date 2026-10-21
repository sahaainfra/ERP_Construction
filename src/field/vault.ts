// Encrypted offline store (Part 14 REQ-FIELD-F07; A-115, A-116). Records are encrypted with AES-GCM under a data key that exists only
// wrapped by a key-encryption key (KEK). The KEK comes from the signed-in session on each unlock, so a stolen device without the
// session cannot read the store. Deleting the wrapped key (logout, revocation, wipe) makes every record unreadable at once.
// The data key is unwrapped as non-extractable, so script can use it but cannot export it.

/** Bytes that WebCrypto accepts (backed by a plain ArrayBuffer). */
export type Bytes = Uint8Array<ArrayBuffer>;

/** A byte store. The browser build uses IndexedDB; tests use the in-memory store below. */
export interface KvBackend {
  get(key: string): Promise<Bytes | undefined>;
  put(key: string, value: Bytes): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export class VaultLockedError extends Error {
  constructor() {
    super("the offline store is locked or has been wiped");
    this.name = "VaultLockedError";
  }
}

const WRAPPED_KEY = "vault/key";
const IV_BYTES = 12;
const KEK_INFO = new TextEncoder().encode("erp-field-vault-kek-v1");

export function createMemoryBackend(): KvBackend {
  const map = new Map<string, Bytes>();
  return {
    get: async (key) => map.get(key),
    put: async (key, value) => {
      map.set(key, value);
    },
    delete: async (key) => {
      map.delete(key);
    },
    keys: async (prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)),
  };
}

/** Derives the non-extractable KEK from a high-entropy session secret (HKDF-SHA256). Call with the session's key material only. */
export async function deriveKek(sessionSecret: Bytes, salt: Bytes): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", sessionSecret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: KEK_INFO }, base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}

/** Creates the data key, wraps it with the KEK and stores only the wrapped form. Called once per device enrolment or after a wipe. */
export async function provisionVault(backend: KvBackend, kek: CryptoKey): Promise<void> {
  // The raw key is extractable only for the moment of wrapping; it is never stored in clear.
  const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapped: Bytes = new Uint8Array(await crypto.subtle.wrapKey("raw", dataKey, kek, { name: "AES-GCM", iv }));
  const stored: Bytes = new Uint8Array(IV_BYTES + wrapped.length);
  stored.set(iv, 0);
  stored.set(wrapped, IV_BYTES);
  await backend.put(WRAPPED_KEY, stored);
}

/** Unwraps the data key as non-extractable. A wrong KEK, a missing key or a damaged key all refuse with the same error. */
export async function unlockVault(backend: KvBackend, kek: CryptoKey): Promise<Vault> {
  const stored = await backend.get(WRAPPED_KEY);
  if (!stored) throw new VaultLockedError();
  try {
    const key = await crypto.subtle.unwrapKey(
      "raw",
      stored.slice(IV_BYTES),
      kek,
      { name: "AES-GCM", iv: stored.slice(0, IV_BYTES) },
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
    return new Vault(backend, key);
  } catch {
    throw new VaultLockedError();
  }
}

/** Deletes the wrapped key and every record. After this, no unlock can read anything that was stored. */
export async function wipeVault(backend: KvBackend): Promise<void> {
  await backend.delete(WRAPPED_KEY);
  for (const key of await backend.keys("record/")) await backend.delete(key);
}

export class Vault {
  constructor(
    private readonly backend: KvBackend,
    private readonly key: CryptoKey,
  ) {}

  /** Stores a record. The collection and id are bound into the ciphertext, so a record cannot be moved to another id. */
  async put(collection: string, id: string, value: unknown): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const plain = new TextEncoder().encode(JSON.stringify(value));
    const cipher: Bytes = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(collection, id) }, this.key, plain));
    const stored: Bytes = new Uint8Array(IV_BYTES + cipher.length);
    stored.set(iv, 0);
    stored.set(cipher, IV_BYTES);
    await this.backend.put(recordKey(collection, id), stored);
  }

  /** Reads a record. Returns undefined when absent; throws when the ciphertext does not verify. */
  async get<T = unknown>(collection: string, id: string): Promise<T | undefined> {
    const stored = await this.backend.get(recordKey(collection, id));
    if (!stored) return undefined;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: stored.slice(0, IV_BYTES), additionalData: aad(collection, id) },
      this.key,
      stored.slice(IV_BYTES),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.backend.delete(recordKey(collection, id));
  }
}

function recordKey(collection: string, id: string): string {
  return `record/${collection}/${id}`;
}

function aad(collection: string, id: string): Bytes {
  return new Uint8Array(new TextEncoder().encode(`${collection}\u0000${id}`));
}
