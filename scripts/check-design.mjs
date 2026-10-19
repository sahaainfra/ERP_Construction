// Design quality gate (DS-7 contrast, DS-4 token lint).
// Run with: node scripts/check-design.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(join(root, "design/design-tokens.json"), "utf8"));
const THEMES = ["light", "dark", "high-contrast"];

function resolve(path, theme) {
  const parts = path.split(".");
  let node = tokens.color;
  for (const part of parts) node = node?.[part];
  if (!node || !node[theme]) throw new Error(`Unknown token "${path}" for theme ${theme}`);
  return node[theme];
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const failures = [];
let checked = 0;

// WCAG 1.4.3 exempts inactive (disabled) components; DS-5 marks text.disabled as "not for information".
const EXEMPT_FG = new Set(["text.disabled"]);

for (const theme of THEMES) {
  for (const pair of tokens.contrastPairs) {
    if (EXEMPT_FG.has(pair.fg)) continue;
    const fg = resolve(pair.fgTheme ?? pair.fg, theme);
    const bg = resolve(pair.bg, theme);
    const min = pair.minRatio ?? 4.5;
    const value = ratio(fg, bg);
    checked += 1;
    if (value < min) {
      failures.push(`${theme}: ${pair.fg} on ${pair.bg} = ${value.toFixed(2)}:1 (needs ${min}:1)`);
    }
  }
}

// Token lint: no raw colour literals in module code. The token package is the only allowed place.
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const allowed = new Set(["src/design/tokens.css"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(css|tsx?|jsx?)$/.test(name)) yield full;
  }
}

let literals = 0;
for (const file of walk(join(root, "src"))) {
  const rel = relative(root, file);
  if (allowed.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const matches = line.match(HEX);
    if (matches) {
      literals += matches.length;
      failures.push(`${rel}:${i + 1} raw colour literal ${matches.join(", ")} (use a token)`);
    }
  });
}

console.log(`Contrast: ${checked} pairings across ${THEMES.length} themes checked.`);
console.log(`Token lint: ${literals} raw colour literal(s) outside the token package.`);

if (failures.length > 0) {
  console.error(`\n${failures.length} design gate failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Design gate passed.");
