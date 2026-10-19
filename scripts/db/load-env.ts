// Loads .env.local (or the file named in ENV_FILE) into process.env. Node's built-in loader; no dependency.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function loadLocalEnv(file = process.env.ENV_FILE ?? ".env.local"): void {
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
  const path = join(root, file);
  if (existsSync(path)) process.loadEnvFile(path);
}
