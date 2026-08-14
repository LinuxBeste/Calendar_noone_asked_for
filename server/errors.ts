/**
 * Unified HTTP error hierarchy. Every error that can reach the request
 * handler surface extends AppError and carries an HTTP status plus a
 * machine-readable code, so the error handler can map + log it
 * consistently and never leaks internals to clients.
 */

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'RATE_LIMIT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BAD_REQUEST'
  | 'BAD_GATEWAY'
  | 'INTERNAL'

export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode
  readonly details?: unknown

  constructor(message: string, statusCode = 400, code: ErrorCode = 'BAD_REQUEST', details?: unknown) {
    super(message)
    this.name = new.target.name
    this.statusCode = statusCode
    this.code = code
    this.details = details
    Error.captureStackTrace?.(this, this.constructor)
  }
}

export class AuthError extends AppError {
  constructor(message: string) {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class PermissionError extends AppError {
  constructor(message: string) {
    super(message, 403, 'FORBIDDEN')
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION', details)
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, 429, 'RATE_LIMIT')
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND')
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT')
  }
}

/** Upstream (feed fetch) failures — the request itself was fine. */
export class BadGatewayError extends AppError {
  constructor(message: string) {
    super(message, 502, 'BAD_GATEWAY')
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}

/** Normalizes any thrown value into an AppError (unknown errors become 500). */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof Error) {
    return new AppError(err.message, 500, 'INTERNAL', { cause: err.message })
  }
  return new AppError('Internal server error', 500, 'INTERNAL')
}