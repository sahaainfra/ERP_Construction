// WCAG 2.2 contrast (Part 12 DS-7; REQ-DS-F11). The same formula as scripts/check-design.mjs. Used by the branding check, which
// runs on the server before a tenant colour is stored, so a failing brand colour is never saved.

export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) throw new RangeError(`not a six-digit hex colour: ${hex}`);
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
