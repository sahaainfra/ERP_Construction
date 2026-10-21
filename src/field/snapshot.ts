// Offline snapshot rules (Part 14 REQ-FIELD-F07, F09, F14; A-117, A-129, A-130). Pure freshness and scope rules, and the Ed25519
// check of a signed authorisation snapshot on the device. Key custody and the signing algorithm are owner decisions (§2.2); the code
// accepts only a public key it is given and never holds a private key.

export type Freshness = "fresh" | "warn" | "blocked";

export interface FreshnessAges {
  /** Hours after which the screen warns that the data may be out of date. */
  softHours: number;
  /** Hours after which controlled actions are blocked. Owner sets it per action (§2.6); there is no default here. */
  hardHours: number;
}

export function freshness(generatedAt: string, now: Date, ages: FreshnessAges): Freshness {
  if (!(ages.softHours > 0) || !(ages.hardHours > ages.softHours)) throw new RangeError("the hard age must be longer than the soft age, both above zero");
  const generated = Date.parse(generatedAt);
  if (Number.isNaN(generated)) throw new RangeError("the generated time is not a date");
  const hours = (now.getTime() - generated) / 3_600_000;
  if (hours >= ages.hardHours) return "blocked";
  if (hours >= ages.softHours) return "warn";
  return "fresh";
}

/** Keeps only the records whose site the viewer may see. The server applies the same rule; this is the device's copy of it. */
export function scopeRecords<T extends { siteId: string }>(records: T[], allowedSiteIds: readonly string[]): T[] {
  const allowed = new Set(allowedSiteIds);
  return records.filter((r) => allowed.has(r.siteId));
}

/** Canonical JSON: object keys sorted at every level, so the same content always gives the same bytes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Whether this browser can check an Ed25519 signature. A device that cannot refuses controlled offline actions and says so (A-130). */
export async function signingSupported(): Promise<boolean> {
  try {
    await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
    return true;
  } catch {
    return false;
  }
}

export async function importSigningKey(publicKeyRaw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", publicKeyRaw, { name: "Ed25519" }, false, ["verify"]);
}

/** True only when the signature matches the canonical form of the payload under the given public key. */
export async function verifySnapshot(payload: unknown, signature: Uint8Array<ArrayBuffer>, publicKey: CryptoKey): Promise<boolean> {
  return crypto.subtle.verify({ name: "Ed25519" }, publicKey, signature, new Uint8Array(new TextEncoder().encode(canonicalJson(payload))));
}
