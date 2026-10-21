import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");
const readCsv = (p: string) => readFileSync(join(root, p), "utf8").trimEnd().split("\n");

// Minimal CSV field splitter for the adoption files: handles quoted fields and doubled quotes.
function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

describe("adoption files (Part 00 §14)", () => {
  it("writes one progress row per Part, each with the full column set", () => {
    const lines = readCsv("docs/erp-program/PROGRESS_REGISTER.csv");
    const header = splitCsv(lines[0]);
    const rows = lines.slice(1).map(splitCsv);
    expect(rows).toHaveLength(95);
    for (const row of rows) expect(row).toHaveLength(header.length);
  });

  it("writes one crosswalk row per old prompt 00–166", () => {
    const lines = readCsv("docs/erp-program/LEGACY_CROSSWALK.csv");
    const rows = lines.slice(1).map(splitCsv);
    expect(rows).toHaveLength(167);
    expect(rows.every((r) => r.length === 5)).toBe(true);
  });

  it("keeps Part 00 at ADOPT mode with the owner signature still pending", () => {
    const row = readCsv("docs/erp-program/PROGRESS_REGISTER.csv")
      .slice(1)
      .map(splitCsv)
      .find((r) => r[0] === "00");
    expect(row?.[4]).toBe("ADOPT");
    expect(row?.[7]).toContain("owner approved");
  });
});
