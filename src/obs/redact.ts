// Value-based redaction for telemetry (Part 09 REQ-OBS-F02; A-39). Key-name redaction stays in core/logger.ts. This module removes
// secret-like and personal values that appear inside free text, or under keys nobody thought to list. Aadhaar candidates are
// checked with the Verhoeff checksum so that ordinary twelve-digit numbers are not blanked.

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** Verhoeff check over a digit string whose last digit is the check digit. */
export function verhoeffValid(digits: string): boolean {
  let c = 0;
  const reversed = digits.split("").reverse();
  reversed.forEach((ch, i) => {
    c = D[c][P[i % 8][Number(ch)]];
  });
  return c === 0;
}

/** The check digit that makes a payload valid. Used by tests and by fixtures; never to generate identifiers. */
export function verhoeffCheckDigit(payload: string): number {
  let c = 0;
  payload.split("").reverse().forEach((ch, i) => {
    c = D[c][P[(i + 1) % 8][Number(ch)]];
  });
  return INV[c];
}

const PAN = /\b[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]\b/g;
const AADHAAR = /\b[2-9][0-9]{3}[ -]?[0-9]{4}[ -]?[0-9]{4}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?91[ -]?)?\b[6-9][0-9]{4}[ -]?[0-9]{5}\b/g;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER = /\b(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi;
const OTP = /\b(otp|one[ -]time(?: password| code)?)\b([^0-9\n]{0,12})[0-9]{4,8}\b/gi;

/** Replaces personal and secret-like values in a string. Idempotent: redacted text redacts to itself. */
export function redactText(text: string): string {
  return text
    .replace(PAN, "[pan]")
    .replace(AADHAAR, (match) => (verhoeffValid(match.replace(/[ -]/g, "")) ? "[aadhaar]" : match))
    .replace(JWT, "[token]")
    .replace(BEARER, "$1[token]")
    .replace(OTP, "$1$2[otp]")
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[phone]");
}
