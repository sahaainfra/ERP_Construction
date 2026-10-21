// Command line for the migration framework: writes the inventory, the duplicate report and the tracker into the repository (A-141).
// Run with `npm run uxmig:scan`. Read-only apart from the three output files.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scanScreens } from "./scan";
import { findVariants, libraryComponents, listTsx, variantsPerFile } from "./duplicates";
import { trackerCsv, type TrackerRow } from "./tracker";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/erp-program/modules/uxmig");

function main(): void {
  const library = libraryComponents(join(ROOT, "src/design/ui"));
  const variants = findVariants(listTsx(join(ROOT, "src")), library);
  const screens = scanScreens(join(ROOT, "src/app"), variantsPerFile(variants));
  const rows: TrackerRow[] = screens.map((s) => ({ route: s.route, module: s.module, classification: s.classification, stage: "inventoried", parityRef: "" }));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "inventory.json"), JSON.stringify({ screens, duplicates: variants }, null, 2) + "\n");
  writeFileSync(join(OUT, "tracker.csv"), trackerCsv(rows));
  console.log(`${screens.length} screen(s), ${variants.length} local component variant(s). Wrote inventory.json and tracker.csv.`);
}

main();
