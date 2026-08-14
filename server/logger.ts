import pino from 'pino'
import { randomUUID } from 'crypto'

/**
 * Central pino configuration for the whole server (Fastify + setup phase).
 * - Level from CALENDAR_LOG_LEVEL (default info), so operators can crank
 *   up/down verbosity without code changes.
 * - ISO timestamps for machine parsing.
 * - Redacts credentials in headers, and tokens/paths in URLs, so secrets
 *   never end up in log files.
 * - Request serializer flattens method/url/ip/host and keeps the request id
 *   attached to every line for correlation across logs.
 */

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const
export const LOG_LEVEL = (() => {
  const raw = process.env.CALENDAR_LOG_LEVEL
  if (raw && (LOG_LEVELS as readonly string[]).includes(raw)) return raw
  if (raw) console.warn(`[logger] Unknown CALENDAR_LOG_LEVEL "${raw}", falling back to "info"`)
  return 'info'
})()

/** Redacts sensitive bits from an incoming URL before it can hit the logs. */
export function redactUrl(url: string): string {
  return url
    .replace(/([?&])token=[^&\s]*/gi, '$1token=[redacted]')
    .replace(/\/public\/[^/]+/g, '/public/[redacted]')
}

/** Error serializer keeps stack + error-code metadata on every error line. */
export function serializeErr(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const statusCode = (err as { statusCode?: number }).statusCode
    const code = (err as { code?: string }).code
    return {
      type: err.name,
      message: err.message,
      stack: err.stack,
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(code !== undefined ? { code } : {})
    }
  }
  return { type: typeof err, value: String(err) }
}

export function createLoggerOptions(): pino.LoggerOptions {
  return {
    level: LOG_LEVEL,
    base: { service: 'calendar-server' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        '*.headers.authorization',
        '*.token'
      ],
      censor: '[redacted]'
    },
    serializers: {
      req(request: { method?: string; raw?: { url?: string }; remoteAddress?: string; ip?: string; host?: string; id?: string }) {
        return {
          method: request.method,
          url: redactUrl(request.raw?.url ?? ''),
          ip: request.remoteAddress ?? request.ip,
          host: request.host,
          requestId: request.id
        }
      },
      res(reply: { statusCode?: number }) {
        return { statusCode: reply.statusCode }
      },
      err(err: unknown) {
        return serializeErr(err)
      }
    }
  }
}

/**
 * Standalone instance for the setup phase (before Fastify is up).
 * Fastify itself is configured with the same options via `logger:`.
 */
export const logger: pino.Logger = pino(createLoggerOptions())

export const loggerOptions = createLoggerOptions()

/** Request-id factory propagating a caller-supplied id (or X-Request-Id header). */
export function genRequestId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const incoming = req.headers['x-request-id']
  const id = Array.isArray(incoming) ? incoming[0] : incoming
  return (id && typeof id === 'string' && id.length <= 80 ? id : randomUUID()).replace(/[^\w.-]/g, '')
}