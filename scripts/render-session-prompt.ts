// Prints a filled Annex E session prompt.
// Examples:
//   npm run prompt -- --part 25A --slice S2          E1 kick-off for one Part slice
//   npm run prompt -- --template E1-legacy --part 01 Plain-text kick-off
//   npm run prompt -- --template E6 --part 01        VERIFY & EXTEND prompt
//   npm run prompt -- --template E4 --phase 3        phase gate
import { renderPartPrompt, renderPhaseGate } from "../src/program/prompts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const template = arg("template") ?? "E1";
const part = arg("part");
const phase = arg("phase");

try {
  const rendered =
    template === "E4"
      ? renderPhaseGate(Number(phase ?? NaN))
      : renderPartPrompt(template, part ?? (() => { throw new Error("--part is required for this template"); })(), {
          slice: arg("slice"),
          repo: arg("repo"),
        });

  process.stdout.write(rendered.text + "\n");
  if (rendered.unfilled.length > 0) {
    process.stderr.write(`\nFill these by hand before pasting: ${rendered.unfilled.join("  ")}\n`);
  }
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
}
