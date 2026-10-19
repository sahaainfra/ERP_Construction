// Renders docs/erp-program/ERROR_CODES.md from the error catalogue, so the document cannot drift from the code (REQ-CORE-F05).
import { ERROR_CATALOGUE } from "./errors";

export function renderErrorCodes(): string {
  const rows = Object.entries(ERROR_CATALOGUE).map(
    ([code, entry]) => `| \`${code}\` | ${entry.status} | ${entry.message} | ${entry.action} |`,
  );
  return [
    "# Error codes",
    "",
    "Generated from `src/core/errors.ts` by `src/core/error-docs.ts`. Do not edit by hand: a test fails when this file differs from the catalogue.",
    "",
    "Every API error uses this envelope: `{ code, message, reason, action, fieldErrors[], correlationId }`. `reason` and `fieldErrors` describe the specific failure; `message` and `action` come from the catalogue. Internal detail is written to the server log only (Part 00 U15).",
    "",
    "| Code | HTTP status | Message | Action |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}
