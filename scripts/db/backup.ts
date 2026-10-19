// Writes a custom-format dump of the migrator database to backups/ (Part 03 REQ-DBF-F12). Run: npm run db:backup
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./load-env";
import { requireUrl } from "../../src/db/config";

const run = promisify(execFile);
loadLocalEnv();
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const url = requireUrl("MIGRATOR_DATABASE_URL");
const dir = join(root, "backups");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${new URL(url).pathname.slice(1)}-${Date.now()}.dump`);
const started = Date.now();
run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--file=${file}`, `--dbname=${url}`])
  .then(() => console.log(`backup written: ${file} (${statSync(file).size} bytes, ${Date.now() - started} ms)`))
  .catch((error) => {
    console.error(`backup failed: ${(error as Error).message}`);
    process.exitCode = 1;
  });
