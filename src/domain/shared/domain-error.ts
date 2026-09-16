export type DomainErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_DENIED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "OWNERSHIP_MISMATCH"
  | "INVARIANT_VIOLATION"
  | "IDEMPOTENCY_CONFLICT"
  | "EXTERNAL_SERVICE_FAILED"
  | "UNEXPECTED";

export type DomainErrorSeverity = "info" | "warning" | "critical";

export type DomainErrorDetails = Readonly<
  Record<string, string | number | boolean>
>;

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly severity: DomainErrorSeverity;
  readonly details?: DomainErrorDetails;

  constructor(
    code: DomainErrorCode,
    message: string,
    options: Readonly<{
      severity?: DomainErrorSeverity;
      details?: DomainErrorDetails;
    }> = {},
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.severity = options.severity ?? severityForCode(code);
    this.details = options.details;
  }
}

export function mapDomainErrorToHttpStatus(error: DomainError) {
  switch (error.code) {
    case "AUTHENTICATION_REQUIRED":
      return 401;
    case "AUTHORIZATION_DENIED":
    case "OWNERSHIP_MISMATCH":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "VALIDATION_FAILED":
    case "INVARIANT_VIOLATION":
      return 422;
    case "EXTERNAL_SERVICE_FAILED":
      return 502;
    case "UNEXPECTED":
      return 500;
  }
}

export function toPublicError(error: unknown) {
  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  return {
    code: "UNEXPECTED" satisfies DomainErrorCode,
    message: "Unexpected application error.",
  };
}

function severityForCode(code: DomainErrorCode): DomainErrorSeverity {
  switch (code) {
    case "UNEXPECTED":
    case "EXTERNAL_SERVICE_FAILED":
      return "critical";
    case "AUTHENTICATION_REQUIRED":
    case "AUTHORIZATION_DENIED":
    case "OWNERSHIP_MISMATCH":
    case "INVARIANT_VIOLATION":
    case "IDEMPOTENCY_CONFLICT":
      return "warning";
    case "VALIDATION_FAILED":
    case "NOT_FOUND":
    case "CONFLICT":
      return "info";
  }
}
