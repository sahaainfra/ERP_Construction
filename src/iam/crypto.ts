// Cryptographic primitives for authentication (Part 07 S1). Node's built-in crypto only: no extra dependency.
// Assumption A-17: scrypt (N=2^14, r=8, p=1) for passwords, in place of Argon2id, which would add a native dependency.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };
const MAX_MEM = 64 * 1024 * 1024;

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** scrypt hash in the form scrypt$N$r$p$salt$key. Parameters travel with the hash, so they can be raised later. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: MAX_MEM });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Checks a password. `needsRehash` is true when the stored parameters are weaker than the current ones. */
export function verifyPassword(password: string, stored: string): { ok: boolean; needsRehash: boolean } {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return { ok: false, needsRehash: false };
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  const actual = scryptSync(password, salt, expected.length, { N, r, p, maxmem: MAX_MEM });
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
  return { ok, needsRehash: N < SCRYPT.N || r < SCRYPT.r || p < SCRYPT.p };
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new RangeError("not a base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const STEP_SECONDS = 30;

/** RFC 6238 six-digit code for a 30-second step. */
export function totpAt(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

/**
 * Checks a TOTP code allowing one step either side for clock drift. A step at or before `lastUsedStep` is refused, so one code
 * works once. Returns the step that matched, to be stored as the new last-used step.
 */
export function verifyTotp(secret: Buffer, code: string, nowMs: number, lastUsedStep: number): { ok: boolean; step: number } {
  if (!/^[0-9]{6}$/.test(code)) return { ok: false, step: lastUsedStep };
  const current = Math.floor(nowMs / 1000 / STEP_SECONDS);
  for (const step of [current, current - 1, current + 1]) {
    if (step <= lastUsedStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return { ok: true, step };
  }
  return { ok: false, step: lastUsedStep };
}

/** AES-256-GCM. Output is base64 of iv (12) | tag (16) | ciphertext. */
export function encryptSecret(plain: Buffer, key: Buffer): string {
  if (key.length !== 32) throw new RangeError("the encryption key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(ciphertext: string, key: Buffer): Buffer {
  const raw = Buffer.from(ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
}

// Access tokens: HS256 only. The header is fixed, so an attacker cannot switch the algorithm ("none" or RS256 confusion).
const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

export function signToken(payload: Record<string, unknown>, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", key).update(`${HEADER}.${body}`).digest("base64url");
  return `${HEADER}.${body}.${sig}`;
}

/** Verifies the signature and returns the payload. Throws on a bad token; expiry is checked by the caller. */
export function verifyToken(token: string, key: Buffer): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== HEADER) throw new Error("token header is not accepted");
  const expected = createHmac("sha256", key).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("token signature is not valid");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
}

export function loadKeys(env: NodeJS.ProcessEnv = process.env): { tokenKey: Buffer; mfaKey: Buffer } {
  const tokenKey = Buffer.from(env.TOKEN_SIGNING_KEY ?? "", "base64");
  const mfaKey = Buffer.from(env.MFA_ENCRYPTION_KEY ?? "", "base64");
  if (tokenKey.length < 32) throw new Error("TOKEN_SIGNING_KEY is missing or shorter than 32 bytes (base64). See LOCALHOST.md.");
  if (mfaKey.length !== 32) throw new Error("MFA_ENCRYPTION_KEY is missing or not 32 bytes (base64). See LOCALHOST.md.");
  return { tokenKey, mfaKey };
}

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;
const COMMON = ["password", "password1234", "letmein12345", "welcome12345", "123456789012", "qwertyuiop12"];

/** Password policy (REQ-IAM-F01): length, not common, not containing the user reference. */
export function passwordProblems(password: string, userRef: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN) problems.push(`at least ${PASSWORD_MIN} characters`);
  if (password.length > PASSWORD_MAX) problems.push(`at most ${PASSWORD_MAX} characters`);
  const lower = password.toLowerCase();
  if (COMMON.some((c) => lower.includes(c))) problems.push("contains a common password");
  if (userRef && lower.includes(userRef.toLowerCase())) problems.push("contains the user reference");
  return problems;
}
