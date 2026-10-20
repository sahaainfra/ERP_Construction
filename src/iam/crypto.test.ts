// Authentication primitives against published test vectors (Part 07 S1).
import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hashPassword, passwordProblems, signToken, totpAt, verifyPassword, verifyToken, verifyTotp } from "./crypto";
import { idTokenProblems, pkceChallengeOf } from "./federation";

describe("TOTP (RFC 6238)", () => {
  // Test secret and six-digit values derived from the RFC's SHA-1 vectors (8-digit 94287082 at T=59 s).
  const secret = Buffer.from("12345678901234567890");
  it("matches the RFC 6238 test vector at T = 59 seconds", () => {
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
  });

  it("accepts a code once, refuses its replay, and allows one step of drift", () => {
    const now = 1_000_000_000_000;
    const step = Math.floor(now / 1000 / 30);
    const code = totpAt(secret, step);
    const first = verifyTotp(secret, code, now, -1);
    expect(first.ok).toBe(true);
    expect(verifyTotp(secret, code, now, first.step).ok).toBe(false);
    expect(verifyTotp(secret, totpAt(secret, step + 1), now, -1).ok).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, step + 5), now, -1).ok).toBe(false);
    expect(verifyTotp(secret, "12345x", now, -1).ok).toBe(false);
  });

  it("round-trips base32", () => {
    const raw = randomBytes(20);
    expect(base32Decode(base32Encode(raw)).equals(raw)).toBe(true);
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });
});

describe("passwords (REQ-IAM-F01)", () => {
  it("verifies the right password and refuses the wrong one", () => {
    const stored = hashPassword("correct horse battery");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse battery", stored).ok).toBe(true);
    expect(verifyPassword("correct horse batterx", stored).ok).toBe(false);
  });

  it("flags a hash made with weaker parameters for rehashing", () => {
    const salt = randomBytes(16);
    const key = scryptSync("correct horse battery", salt, 64, { N: 1024, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const stored = `scrypt$1024$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
    expect(verifyPassword("correct horse battery", stored)).toMatchObject({ ok: true, needsRehash: true });
  });

  it("enforces the policy: length, common passwords, the user reference", () => {
    expect(passwordProblems("short", "u1").join(" ")).toMatch(/at least 12/);
    expect(passwordProblems("password1234", "u1").join(" ")).toMatch(/common/);
    expect(passwordProblems("u1-long-secret-phrase", "u1").join(" ")).toMatch(/user reference/);
    expect(passwordProblems("a long quiet passphrase", "u1")).toEqual([]);
  });
});

describe("secrets and tokens", () => {
  it("encrypts and decrypts a secret, and refuses the wrong key", () => {
    const key = randomBytes(32);
    const ct = encryptSecret(Buffer.from("factor secret"), key);
    expect(decryptSecret(ct, key).toString()).toBe("factor secret");
    expect(() => decryptSecret(ct, randomBytes(32))).toThrow();
  });

  it("accepts a correctly signed token and refuses a tampered one or a different algorithm", () => {
    const key = randomBytes(32);
    const token = signToken({ sub: "u1", exp: 9999999999 }, key);
    expect(verifyToken(token, key)).toMatchObject({ sub: "u1" });
    const [h, b, s] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ sub: "admin", exp: 9999999999 })).toString("base64url");
    expect(() => verifyToken(`${h}.${forgedBody}.${s}`, key)).toThrow("signature");
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    expect(() => verifyToken(`${none}.${b}.`, key)).toThrow("header");
  });
});

describe("federation (REQ-IAM-F02)", () => {
  it("computes the PKCE challenge of the RFC 7636 example", () => {
    expect(pkceChallengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("checks issuer, audience, expiry and nonce", () => {
    const base = { issuer: "https://idp.example", clientId: "erp", nonce: "n1", nowSeconds: 1000 };
    expect(idTokenProblems({ iss: base.issuer, aud: ["erp"], exp: 2000, nonce: "n1" }, base)).toEqual([]);
    expect(idTokenProblems({ iss: "https://evil", aud: "erp", exp: 2000, nonce: "n1" }, base).join(" ")).toMatch(/expected provider/);
    expect(idTokenProblems({ iss: base.issuer, aud: "other", exp: 2000, nonce: "n1" }, base).join(" ")).toMatch(/not meant/);
    expect(idTokenProblems({ iss: base.issuer, aud: "erp", exp: 900, nonce: "n1" }, base).join(" ")).toMatch(/expired/);
    expect(idTokenProblems({ iss: base.issuer, aud: "erp", exp: 2000, nonce: "other" }, base).join(" ")).toMatch(/nonce/);
  });
});
