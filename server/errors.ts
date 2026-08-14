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

/** Fastify's own error codes (e.g. body too large) mapped to HTTP statuses. */
const FASTIFY_ERROR_STATUS: Record<string, number> = {
  FST_ERR_CTP_BODY_TOO_LARGE: 413,
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 415,
  FST_ERR_CTP_INVALID_JSON_BODY: 400,
  FST_ERR_CTP_EMPTY_JSON_BODY: 400,
  FST_ERR_BAD_URL: 400,
  FST_ERR_VALIDATION: 400,
  FST_ERR_NOT_FOUND: 404
}

function clientStatusCode(err: Error): number | undefined {
  const code = (err as { code?: string }).code
  if (code && code in FASTIFY_ERROR_STATUS) return FASTIFY_ERROR_STATUS[code]!
  const statusCode = (err as { statusCode?: unknown }).statusCode
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) return statusCode
  return undefined
}

/** Normalizes any thrown value into an AppError (unknown errors become 500). */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof Error) {
    const statusCode = clientStatusCode(err)
    if (statusCode !== undefined) {
      return new AppError(err.message, statusCode, 'BAD_REQUEST', { cause: err.message })
    }
    return new AppError('Internal server error', 500, 'INTERNAL', { cause: err.message })
  }
  return new AppError('Internal server error', 500, 'INTERNAL')
}