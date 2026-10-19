// Loads an OpenAPI document from docs/erp-program/api/openapi (used by tests and the contract gate).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenApiDocument } from "./contracts";

export function loadOpenApi(file: string): OpenApiDocument {
  const path = join(__dirname, "../../docs/erp-program/api/openapi", file);
  return JSON.parse(readFileSync(path, "utf8")) as OpenApiDocument;
}
