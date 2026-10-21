# Error codes

Generated from `src/core/errors.ts` by `src/core/error-docs.ts`. Do not edit by hand: a test fails when this file differs from the catalogue.

Every API error uses this envelope: `{ code, message, reason, action, fieldErrors[], correlationId }`. `reason` and `fieldErrors` describe the specific failure; `message` and `action` come from the catalogue. Internal detail is written to the server log only (Part 00 U15).

| Code | HTTP status | Message | Action |
|---|---|---|---|
| `VALIDATION_FAILED` | 422 | Some values are not valid. | Correct the highlighted fields and submit again. |
| `NOT_FOUND` | 404 | The record was not found. | Check the link or the search and try again. |
| `FORBIDDEN` | 403 | You do not have permission for this action. | Ask the record owner or an administrator for access. |
| `CONFLICT` | 409 | The record changed while you were editing it. | Reload the record and apply your change again. |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | A request with this key is still running. | Wait a moment and retry with the same key. |
| `IDEMPOTENCY_PAYLOAD_MISMATCH` | 422 | This key was already used with different data. | Use a new key for a different request. |
| `MAKER_CHECKER_REQUIRED` | 409 | A second person must approve this change. | Send the change for approval. |
| `NUMBER_SERIES_UNKNOWN` | 422 | The number series does not exist. | Check the document type configuration. |
| `NUMBER_VOID_REASON_REQUIRED` | 422 | A void needs a reason of at least 10 characters. | Enter the reason and try again. |
| `PROTOCOL_BLOCKED` | 409 | A control stopped this action. | Review the control message and request an exception if allowed. |
| `SERVICE_UNAVAILABLE` | 503 | The service is temporarily unavailable. | Retry in a few minutes. |
| `INTERNAL_ERROR` | 500 | Something went wrong on our side. | Retry. If it continues, send the correlation ID to support. |
