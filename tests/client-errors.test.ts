import { describe, it, expect } from 'vitest'
import { errorInfo, toErrorMessage, fieldErrors, formatFieldErrors } from '../src/utils/errors'

describe('errorInfo', () => {
  it('extracts the backend error shape off plain objects', () => {
    const info = errorInfo({ message: 'nope', code: 'VALIDATION', statusCode: 400, details: [{ path: 'title', message: 'required' }] })
    expect(info).toEqual({ message: 'nope', code: 'VALIDATION', statusCode: 400, details: [{ path: 'title', message: 'required' }] })
  })

  it('extracts message from real Error instances', () => {
    expect(errorInfo(new Error('boom'))).toEqual({ message: 'boom' })
  })

  it('returns an empty object for non-objects', () => {
    expect(errorInfo(undefined)).toEqual({})
    expect(errorInfo('str')).toEqual({})
    expect(errorInfo(null)).toEqual({})
  })
})

describe('toErrorMessage', () => {
  it('maps NETWORK to an actionable message', () => {
    expect(toErrorMessage({ code: 'NETWORK' })).toContain("Can't reach the server")
  })

  it('maps RATE_LIMIT to a retry hint', () => {
    expect(toErrorMessage({ code: 'RATE_LIMIT' })).toContain('Too many attempts')
  })

  it('maps UNAUTHORIZED to a sign-in hint', () => {
    expect(toErrorMessage({ code: 'UNAUTHORIZED' })).toContain('sign in again')
  })

  it('maps 5xx to a server-side message', () => {
    expect(toErrorMessage({ statusCode: 503 })).toContain('server hit an unexpected error')
  })

  it('falls back to the server message', () => {
    expect(toErrorMessage({ message: 'Title is required' })).toBe('Title is required')
  })

  it('falls back to a generic message', () => {
    expect(toErrorMessage(undefined)).toBe('Something went wrong')
  })
})

describe('fieldErrors', () => {
  it('maps details to a path → message map, first entry wins', () => {
    const map = fieldErrors({ details: [{ path: 'title', message: 'required' }, { path: 'title', message: 'too long' }] })
    expect(map).toEqual({ title: 'required' })
  })

  it('ignores malformed entries', () => {
    expect(fieldErrors({ details: [{ path: 'title' }, 'junk'] })).toEqual({})
  })

  it('returns an empty map when there are no details', () => {
    expect(fieldErrors({ message: 'nope' })).toEqual({})
  })
})

describe('formatFieldErrors', () => {
  it('formats entries for inline display', () => {
    expect(formatFieldErrors({ details: [{ path: 'title', message: 'required' }] })).toEqual(['title: required'])
  })

  it('returns an empty array when there are no field errors', () => {
    expect(formatFieldErrors(new Error('boom'))).toEqual([])
  })
})
