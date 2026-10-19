// Identifier and value checks for the enterprise structure (Part 06 §7). Pure functions: the same rules run in forms and in
// the service, so a value refused in the form is also refused by the server.

export const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** The fourth PAN character says whether the holder is a company (C), firm (F), individual (P) and so on. */
const PAN_HOLDER_TYPES = "ABCFGHJLPT";
const STATE_CODE = /^(0[1-9]|[1-3][0-9])$/;
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isPan(value: string): boolean {
  return PAN.test(value) && PAN_HOLDER_TYPES.includes(value[3]);
}

/** Check character of a 15-character GSTIN (weighted sum of base-36 digits, weights 1 and 2 alternately). */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(first14[i]) * ((i % 2) + 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

/** Returns the reasons a GSTIN is not valid. It must match the format, pass the check character, carry the PAN, and agree with the state. */
export function gstinProblems(gstin: string, expected: { pan?: string; stateCode?: string } = {}): string[] {
  if (!GSTIN.test(gstin)) return ["GSTIN has the wrong format"];
  const problems: string[] = [];
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) problems.push("GSTIN check character is wrong");
  if (expected.pan !== undefined && gstin.slice(2, 12) !== expected.pan) problems.push("GSTIN does not carry the legal entity's PAN");
  if (expected.stateCode !== undefined && gstin.slice(0, 2) !== expected.stateCode) problems.push("GSTIN state code does not match the registration state");
  return problems;
}

export function isStateCode(value: string): boolean {
  return STATE_CODE.test(value);
}

export function isUnitCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_-]{1,19}$/.test(value);
}

export function coordinatesProblems(latitude: number | null, longitude: number | null): string[] {
  if (latitude === null && longitude === null) return [];
  if (latitude === null || longitude === null) return ["latitude and longitude must be given together"];
  const problems: string[] = [];
  if (!(latitude >= -90 && latitude <= 90)) problems.push("latitude must be between -90 and 90");
  if (!(longitude >= -180 && longitude <= 180)) problems.push("longitude must be between -180 and 180");
  return problems;
}

/** Ordered date check on ISO dates (YYYY-MM-DD). Compared as text, which is correct for this format. */
export function datesProblems(from: string, to: string | null): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return ["valid-from must be a date (YYYY-MM-DD)"];
  if (to !== null && !/^\d{4}-\d{2}-\d{2}$/.test(to)) return ["valid-to must be a date (YYYY-MM-DD)"];
  if (to !== null && to < from) return ["valid-to cannot be before valid-from"];
  return [];
}
