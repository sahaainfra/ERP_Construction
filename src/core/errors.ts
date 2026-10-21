// Error envelope and error-code catalogue (Part 05 REQ-CORE-F05; AC-4). Clients receive the envelope; details stay in the log (U15).

export interface FieldError {
  field: string;
  message: string;
}

export interface ErrorEnvelope {
  code: string;
  message: string;
  reason: string;
  action: string;
  fieldErrors: FieldError[];
  correlationId: string;
}

export const ERROR_CATALOGUE = {
  VALIDATION_FAILED: { status: 422, message: "Some values are not valid.", action: "Correct the highlighted fields and submit again." },
  NOT_FOUND: { status: 404, message: "The record was not found.", action: "Check the link or the search and try again." },
  FORBIDDEN: { status: 403, message: "You do not have permission for this action.", action: "Ask the record owner or an administrator for access." },
  CONFLICT: { status: 409, message: "The record changed while you were editing it.", action: "Reload the record and apply your change again." },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, message: "A request with this key is still running.", action: "Wait a moment and retry with the same key." },
  IDEMPOTENCY_PAYLOAD_MISMATCH: { status: 422, message: "This key was already used with different data.", action: "Use a new key for a different request." },
  MAKER_CHECKER_REQUIRED: { status: 409, message: "A second person must approve this change.", action: "Send the change for approval." },
  NUMBER_SERIES_UNKNOWN: { status: 422, message: "The number series does not exist.", action: "Check the document type configuration." },
  NUMBER_VOID_REASON_REQUIRED: { status: 422, message: "A void needs a reason of at least 10 characters.", action: "Enter the reason and try again." },
  PROTOCOL_BLOCKED: { status: 409, message: "A control stopped this action.", action: "Review the control message and request an exception if allowed." },
  SERVICE_UNAVAILABLE: { status: 503, message: "The service is temporarily unavailable.", action: "Retry in a few minutes." },
  INTERNAL_ERROR: { status: 500, message: "Something went wrong on our side.", action: "Retry. If it continues, send the correlation ID to support." },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOGUE;

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly reason: string,
    public readonly fieldErrors: FieldError[] = [],
  ) {
    super(`${code}: ${reason}`);
    this.name = "AppError";
  }

  get status(): number {
    return ERROR_CATALOGUE[this.code].status;
  }
}

/** Converts any error to the envelope. Unknown errors become INTERNAL_ERROR with no internal text. */
export function toEnvelope(error: unknown, correlationId: string): { status: number; body: ErrorEnvelope } {
  if (error instanceof AppError) {
    const entry = ERROR_CATALOGUE[error.code];
    return {
      status: entry.status,
      body: { code: error.code, message: entry.message, reason: error.reason, action: entry.action, fieldErrors: error.fieldErrors, correlationId },
    };
  }
  const entry = ERROR_CATALOGUE.INTERNAL_ERROR;
  return {
    status: entry.status,
    body: { code: "INTERNAL_ERROR", message: entry.message, reason: "An unexpected error occurred.", action: entry.action, fieldErrors: [], correlationId },
  };
}
