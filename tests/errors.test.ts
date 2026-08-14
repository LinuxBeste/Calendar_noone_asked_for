import { describe, it, expect } from 'vitest'
import {
  AppError,
  AuthError,
  PermissionError,
  ValidationError,
  RateLimitError,
  NotFoundError,
  BadGatewayError,
  toAppError
} from '../server/errors'

describe('error taxonomy', () => {
  it('assigns the right status and code to each error type', () => {
    expect(new AuthError('x').statusCode).toBe(401)
    expect(new AuthError('x').code).toBe('UNAUTHORIZED')
    expect(new PermissionError('x').statusCode).toBe(403)
    expect(new PermissionError('x').code).toBe('FORBIDDEN')
    expect(new ValidationError('x').statusCode).toBe(400)
    expect(new ValidationError('x').code).toBe('VALIDATION')
    expect(new RateLimitError('x').statusCode).toBe(429)
    expect(new RateLimitError('x').code).toBe('RATE_LIMIT')
    expect(new NotFoundError().statusCode).toBe(404)
    expect(new NotFoundError().code).toBe('NOT_FOUND')
    expect(new BadGatewayError('x').statusCode).toBe(502)
    expect(new BadGatewayError('x').code).toBe('BAD_GATEWAY')
  })

  it('keeps details and a stable name', () => {
    const err = new ValidationError('bad', [{ path: 'title', message: 'too long' }])
    expect(err.name).toBe('ValidationError')
    expect(err.details).toEqual([{ path: 'title', message: 'too long' }])
    expect(err instanceof AppError).toBe(true)
  })
})

describe('toAppError', () => {
  it('passes AppErrors through unchanged', () => {
    const err = new PermissionError('nope')
    expect(toAppError(err)).toBe(err)
  })

  it('maps unknown errors to a generic 500 that hides internals', () => {
    const mapped = toAppError(new Error('secret stack details'))
    expect(mapped.statusCode).toBe(500)
    expect(mapped.code).toBe('INTERNAL')
    expect(mapped.message).toBe('Internal server error')
  })

  it('maps errors carrying a 4xx statusCode (e.g. Fastify) to that status', () => {
    const mapped = toAppError(Object.assign(new Error('Request body is too large'), { statusCode: 413 }))
    expect(mapped.statusCode).toBe(413)
    expect(mapped.code).toBe('BAD_REQUEST')
  })

  it('maps known Fastify error codes to the right status', () => {
    const tooLarge = toAppError(Object.assign(new Error('body too large'), { code: 'FST_ERR_CTP_BODY_TOO_LARGE' }))
    expect(tooLarge.statusCode).toBe(413)
    const badJson = toAppError(Object.assign(new Error('Invalid JSON'), { code: 'FST_ERR_CTP_INVALID_JSON_BODY' }))
    expect(badJson.statusCode).toBe(400)
    const badMedia = toAppError(Object.assign(new Error('media'), { code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE' }))
    expect(badMedia.statusCode).toBe(415)
  })

  it('keeps 5xx status codes as internal errors instead of passing them through', () => {
    const mapped = toAppError(Object.assign(new Error('boom'), { statusCode: 503 }))
    expect(mapped.statusCode).toBe(500)
    expect(mapped.code).toBe('INTERNAL')
  })

  it('maps non-Error values to 500', () => {
    const mapped = toAppError('string rejection')
    expect(mapped.statusCode).toBe(500)
    expect(mapped.code).toBe('INTERNAL')
  })
})