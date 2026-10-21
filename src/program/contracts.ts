// API contract diff (Part 04 REQ-CICD-F01 contract stage; AC-4). Compares two OpenAPI 3 documents and reports breaking changes.
// Breaking: a removed path or method, a removed response status, a removed response property, a changed property type,
// or a new required request property. Additive changes are reported as non-breaking.

export interface OpenApiSchema {
  type?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
}

export interface OpenApiOperation {
  responses: Record<string, { content?: Record<string, { schema?: OpenApiSchema }> }>;
  requestBody?: { required?: boolean; content?: Record<string, { schema?: OpenApiSchema }> };
}

export interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Record<string, OpenApiOperation>>;
}

export interface ContractChange {
  breaking: boolean;
  where: string;
  detail: string;
}

const METHODS = ["get", "put", "post", "delete", "patch"] as const;

function diffSchema(before: OpenApiSchema | undefined, after: OpenApiSchema | undefined, where: string, out: ContractChange[]): void {
  if (!before || !after) return;
  if (before.type && after.type && before.type !== after.type) {
    out.push({ breaking: true, where, detail: `type changed from ${before.type} to ${after.type}` });
  }
  for (const name of Object.keys(before.properties ?? {})) {
    if (!after.properties || !(name in after.properties)) {
      out.push({ breaking: true, where: `${where}.${name}`, detail: "property removed" });
    } else {
      diffSchema(before.properties?.[name], after.properties[name], `${where}.${name}`, out);
    }
  }
  for (const name of Object.keys(after.properties ?? {})) {
    if (!(name in (before.properties ?? {}))) out.push({ breaking: false, where: `${where}.${name}`, detail: "property added" });
  }
  if (before.items && after.items) diffSchema(before.items, after.items, `${where}[]`, out);
}

export function contractChanges(before: OpenApiDocument, after: OpenApiDocument): ContractChange[] {
  const out: ContractChange[] = [];
  for (const [path, methods] of Object.entries(before.paths)) {
    if (!after.paths[path]) {
      out.push({ breaking: true, where: path, detail: "path removed" });
      continue;
    }
    for (const method of METHODS) {
      const b = methods[method];
      if (!b) continue;
      const a = after.paths[path][method];
      const where = `${method.toUpperCase()} ${path}`;
      if (!a) {
        out.push({ breaking: true, where, detail: "operation removed" });
        continue;
      }
      for (const status of Object.keys(b.responses)) {
        if (!(status in a.responses)) {
          out.push({ breaking: true, where: `${where} ${status}`, detail: "response status removed" });
          continue;
        }
        diffSchema(
          b.responses[status].content?.["application/json"]?.schema,
          a.responses[status].content?.["application/json"]?.schema,
          `${where} ${status}`,
          out,
        );
      }
      for (const status of Object.keys(a.responses)) {
        if (!(status in b.responses)) out.push({ breaking: false, where: `${where} ${status}`, detail: "response status added" });
      }
      const requiredBefore = new Set(b.requestBody?.content?.["application/json"]?.schema?.required ?? []);
      const afterSchema = a.requestBody?.content?.["application/json"]?.schema;
      for (const name of afterSchema?.required ?? []) {
        if (!requiredBefore.has(name)) out.push({ breaking: true, where: `${where} request.${name}`, detail: "new required request property" });
      }
      diffSchema(b.requestBody?.content?.["application/json"]?.schema, afterSchema, `${where} request`, out);
    }
  }
  return out;
}

export const breakingChanges = (before: OpenApiDocument, after: OpenApiDocument): ContractChange[] =>
  contractChanges(before, after).filter((c) => c.breaking);
