/**
 * Client-side error handling helpers.
 *
 * Errors arriving from the backend (through the IPC bridge) are plain
 * objects shaped like `{ message, code, statusCode, details }` — they are
 * *not* `Error` instances after crossing the contextBridge, so everything
 * here duck-types instead of using `instanceof`.
 */

export interface FieldError {
  path: string
  message: string
}

export interface ApiErrorInfo {
  message?: string
  code?: string
  statusCode?: number
  details?: FieldError[]
}

/** Extracts the backend error shape off any thrown value (or an empty object). */
export function errorInfo(err: unknown): ApiErrorInfo {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    return {
      message: typeof e.message === 'string' ? e.message : undefined,
      code: typeof e.code === 'string' ? e.code : undefined,
      statusCode: typeof e.statusCode === 'number' ? e.statusCode : undefined,
      details: Array.isArray(e.details) ? (e.details as FieldError[]) : undefined
    }
  }
  return {}
}

/** Maps a backend error to a friendly, actionable message for the user. */
export function toErrorMessage(err: unknown): string {
  const { message, code, statusCode } = errorInfo(err)
  if (code === 'NETWORK') {
    return "Can't reach the server — check that it's running and that the server address in Settings is correct"
  }
  if (code === 'RATE_LIMIT') {
    return 'Too many attempts — please wait a moment and try again'
  }
  if (code === 'UNAUTHORIZED') {
    return 'Your session has expired — please sign in again'
  }
  if (typeof statusCode === 'number' && statusCode >= 500) {
    return 'The server hit an unexpected error — please try again in a moment'
  }
  return message && message.length > 0 ? message : 'Something went wrong'
}

/** Maps `details: [{ path, message }]` (from server-side validation) to a field → message map. */
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of errorInfo(err).details ?? []) {
    if (f && typeof f.path === 'string' && typeof f.message === 'string' && !out[f.path]) {
      out[f.path] = f.message
    }
  }
  return out
}

/** Formats field errors for inline display, e.g. "title: Title is required". */
export function formatFieldErrors(err: unknown): string[] {
  return Object.entries(fieldErrors(err)).map(([path, message]) => `${path}: ${message}`)
}

/** Structured console log for diagnostics (status/code/stack). */
export function logError(context: string, err: unknown): void {
  const info = errorInfo(err)
  const meta = [
    info.code ? `code=${info.code}` : '',
    info.statusCode !== undefined ? `status=${info.statusCode}` : ''
  ].filter(Boolean).join(' ')
  const message = info.message ?? (err instanceof Error ? err.message : String(err))
  console.error(`[${context}]${meta ? ` ${meta}` : ''}: ${message}`)
  if (err instanceof Error && err.stack) console.debug(err.stack)
  if (info.details?.length) console.debug('details:', info.details)
}