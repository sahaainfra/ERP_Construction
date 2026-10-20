// Literal lint (Part 12 REQ-DS-F01, DS-4; CP-DS-02). Colours come from the token package only. Module code may not write a hex,
// rgb() or hsl() colour; a needed variant is a request to the design owner. Token files and tests are exempt.

const COLOUR_LITERAL = /#(?:[0-9a-fA-F]{3}){1,2}\b|\brgba?\(|\bhsla?\(/;
const EXEMPT = [/^src\/design\/tokens\.(css|ts)$/, /^src\/design\/fonts\.css$/, /^src\/design\/literals\.ts$/, /\.test\.(ts|tsx)$/];

/** Returns one message per line that writes a colour literal. An empty list means the file is clean. */
export function literalProblems(path: string, text: string): string[] {
  if (EXEMPT.some((re) => re.test(path))) return [];
  const problems: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (COLOUR_LITERAL.test(line)) problems.push(`${path}:${i + 1}: colour literal; use a design token`);
  });
  return problems;
}
