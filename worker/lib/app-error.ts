export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_DATE_RANGE"
  | "SOURCE_NOT_CONFIGURED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: 400 | 404 | 429 | 500 | 502 | 503 | 504,
    readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "AppError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError("INTERNAL_ERROR", 500, undefined, { cause: error });
}
