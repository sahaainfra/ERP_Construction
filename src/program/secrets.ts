// Secret-pattern detection (Part 04 security slot; Part 08 owns the full scanner). Reports the kind and the line only, never the value.

export const SECRET_PATTERNS: Readonly<Record<string, RegExp>> = {
  awsAccessKey: /AKIA[0-9A-Z]{16}/,
  privateKeyBlock: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  assignedSecret: /(api[_-]?key|secret|passwd|password|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
};

export function secretFindings(text: string): { line: number; kind: string }[] {
  const out: { line: number; kind: string }[] = [];
  text.split("\n").forEach((line, i) => {
    for (const [kind, pattern] of Object.entries(SECRET_PATTERNS)) {
      if (pattern.test(line)) out.push({ line: i + 1, kind });
    }
  });
  return out;
}
