import { describe, it, expect } from 'vitest'
import { redactUrl, serializeErr } from '../server/logger'

describe('redactUrl', () => {
  it('redacts token query parameters', () => {
    expect(redactUrl('/ws?token=abc123&x=1')).toBe('/ws?token=[redacted]&x=1')
    expect(redactUrl('/ws?TOKEN=abc')).toBe('/ws?token=[redacted]')
  })

  it('redacts public share paths', () => {
    expect(redactUrl('/api/public/superSecretToken')).toBe('/api/public/[redacted]')
    expect(redactUrl('/public/superSecretToken/events')).toBe('/public/[redacted]/events')
  })

  it('leaves ordinary URLs untouched', () => {
    expect(redactUrl('/calendars?name=Holiday')).toBe('/calendars?name=Holiday')
  })
})

describe('serializeErr', () => {
  it('includes type, message, stack and error metadata', () => {
    const err = Object.assign(new Error('boom'), { statusCode: 400, code: 'VALIDATION' })
    const out = serializeErr(err)
    expect(out.type).toBe('Error')
    expect(out.message).toBe('boom')
    expect(out.statusCode).toBe(400)
    expect(out.code).toBe('VALIDATION')
    expect(out.stack).toContain('boom')
  })

  it('includes structured details when present', () => {
    const err = Object.assign(new Error('bad'), { details: [{ path: 'title', message: 'too long' }] })
    expect(serializeErr(err).details).toEqual([{ path: 'title', message: 'too long' }])
  })

  it('handles non-Error values without throwing', () => {
    const out = serializeErr('plain string')
    expect(out.type).toBe('string')
    expect(out.value).toBe('plain string')
  })
})