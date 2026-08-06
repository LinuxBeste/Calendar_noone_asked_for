import { describe, it, expect } from 'vitest'
import {
  ValidationError,
  validateCalendarInput,
  validateCalendarPatch,
  validateEventInput,
  validateEventPatch,
  validateShareInput,
  validateSetting,
  validateSearchQuery,
  validateRange,
  capLimit,
  capDueWindow,
  validateReminderMinutes,
  validatePassword,
  validateName,
  normalizeEmail,
  validateImportContent
} from '../server/validation'

const validEvent = {
  calendarId: 'cal-1',
  title: 'Standup',
  allDay: false,
  startsAt: '2026-08-06T09:00:00.000Z',
  endsAt: '2026-08-06T09:30:00.000Z',
  color: '#1a73e8',
  busy: true
}

function expectValidationError(fn: () => unknown): void {
  try {
    fn()
    expect.unreachable('expected ValidationError')
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError)
  }
}

describe('validation', () => {
  it('rejects invalid emails and passwords', () => {
    expectValidationError(() => normalizeEmail('not-an-email'))
    expectValidationError(() => validatePassword('12345'))
    expectValidationError(() => validateName(''))
    expectValidationError(() => validateName('x'.repeat(101)))
    expect(normalizeEmail('  Foo@Example.COM ')).toBe('foo@example.com')
  })

  it('validates calendar input', () => {
    expect(validateCalendarInput({ name: 'Work' }).name).toBe('Work')
    expect(validateCalendarInput({ name: 'Work', color: '#ff0000' }).color).toBe('#ff0000')
    expectValidationError(() => validateCalendarInput({ name: '' }))
    expectValidationError(() => validateCalendarInput({ name: 'Work', color: 'red' }))
    expectValidationError(() => validateCalendarPatch({}))
    expectValidationError(() => validateCalendarPatch({ color: 'nope' }))
    expect(validateCalendarPatch({ visible: false })).toEqual({ visible: false })
  })

  it('validates event input', () => {
    expect(validateEventInput(validEvent).title).toBe('Standup')
    expectValidationError(() => validateEventInput({ ...validEvent, title: '' }))
    expectValidationError(() => validateEventInput({ ...validEvent, endsAt: '2026-08-06T08:00:00.000Z' }))
    expectValidationError(() => validateEventInput({ ...validEvent, color: 'blue' }))
    expectValidationError(() => validateEventInput({ ...validEvent, rrule: 'RRULE:FREQ=HOURLY' }))
    expectValidationError(() => validateEventInput({ ...validEvent, allDay: true }))
    expect(validateEventInput({ ...validEvent, allDay: true, startDate: '2026-08-06', endDate: '2026-08-06' }).allDay).toBe(true)
    expectValidationError(() => validateEventInput({ ...validEvent, allDay: true, startDate: '2026-08-06', endDate: '2026-08-05' }))
    expect(validateEventInput({ ...validEvent, title: '  X  ' }).title).toBe('X')
    expect(validateEventPatch({ description: 'd' }).description).toBe('d')
  })

  it('validates share input', () => {
    expect(validateShareInput({ email: 'a@b.de', role: 'editor' })).toEqual({ email: 'a@b.de', role: 'editor' })
    expectValidationError(() => validateShareInput({ email: 'x', role: 'viewer' }))
    expectValidationError(() => validateShareInput({ email: 'a@b.de', role: 'admin' }))
  })

  it('whitelists settings keys and values', () => {
    expect(validateSetting('firstDayOfWeek', 1).value).toBe(1)
    expect(validateSetting('timeFormat', '12h').value).toBe('12h')
    expect(validateSetting('defaultView', 'agenda').value).toBe('agenda')
    expect(validateSetting('darkMode', 'auto').value).toBe('auto')
    expectValidationError(() => validateSetting('unknownKey', 1))
    expectValidationError(() => validateSetting('firstDayOfWeek', 2))
    expectValidationError(() => validateSetting('timeFormat', 'military'))
    expectValidationError(() => validateSetting('timezone', 'Not/AZone'))
    expectValidationError(() => validateSetting('showWeekNumbers', 'yes'))
    expect(validateSetting('defaultReminderMinutes', 30).value).toBe(30)
    expectValidationError(() => validateSetting('defaultReminderMinutes', 7))
  })

  it('enforces range, search, limit and window caps', () => {
    validateRange('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')
    expectValidationError(() => validateRange('nope', '2026-02-01T00:00:00.000Z'))
    expectValidationError(() => validateRange('2000-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'))
    expect(validateSearchQuery('  meeting  ')).toBe('meeting')
    expectValidationError(() => validateSearchQuery(''))
    expectValidationError(() => validateSearchQuery('x'.repeat(200)))
    expect(capLimit(undefined)).toBeUndefined()
    expect(capLimit(1000)).toBe(50)
    expectValidationError(() => capLimit('abc'))
    expect(capDueWindow(999999)).toBe(1440)
    expectValidationError(() => capDueWindow('abc'))
    expect(validateReminderMinutes(10)).toBe(10)
    expectValidationError(() => validateReminderMinutes(-5))
  })

  it('rejects oversized imports', () => {
    expectValidationError(() => validateImportContent(123, 100, 'iCal'))
    expectValidationError(() => validateImportContent('x'.repeat(200), 100, 'iCal'))
    expect(validateImportContent('BEGIN:VCALENDAR', 1024, 'iCal')).toBe('BEGIN:VCALENDAR')
  })
})
