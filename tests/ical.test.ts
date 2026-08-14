import { describe, it, expect } from 'vitest'
import { serializeICal, parseICal, toEventInputs } from '../server/services/ical'
import type { Event, Reminder } from '../shared/types'

const base: Event = {
  id: 'ev1',
  calendarId: 'c1',
  title: 'Test',
  allDay: false,
  busy: true,
  createdAt: '',
  updatedAt: ''
}

describe('ical', () => {
  it('round-trips a timed event with description and reminder', () => {
    const ev: Event = { ...base, title: 'Coffee; break', description: 'Line 1\nLine 2', location: 'Café, Room 3', startsAt: '2026-08-06T09:00:00', endsAt: '2026-08-06T09:30:00' }
    const reminders: Reminder[] = [{ id: 'r1', eventId: 'ev1', minutes: 10 }]
    const ics = serializeICal([{ ev, reminders }])
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Coffee\\; break')
    expect(ics).toContain('TRIGGER:-PT10M')

    const parsed = parseICal(ics)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.title).toBe('Coffee; break')
    expect(parsed[0]!.description).toBe('Line 1\nLine 2')
    expect(parsed[0]!.location).toBe('Café, Room 3')
    expect(parsed[0]!.allDay).toBe(false)
    expect(parsed[0]!.startsAt).toBe('2026-08-06T09:00:00.000')
    expect(parsed[0]!.endsAt).toBe('2026-08-06T09:30:00.000')
    expect(parsed[0]!.reminderMinutes).toBe(10)
  })

  it('round-trips an all-day event (exclusive DTEND)', () => {
    const ev: Event = { ...base, title: 'Vacation', allDay: true, startDate: '2026-08-10', endDate: '2026-08-14' }
    const ics = serializeICal([{ ev, reminders: [] }])
    expect(ics).toContain('DTSTART;VALUE=DATE:20260810')
    // iCal all-day DTEND is exclusive — one day after the inclusive endDate.
    expect(ics).toContain('DTEND;VALUE=DATE:20260815')

    const parsed = parseICal(ics)
    expect(parsed[0]!.allDay).toBe(true)
    expect(parsed[0]!.startDate).toBe('2026-08-10')
    expect(parsed[0]!.endDate).toBe('2026-08-14')
  })

  it('parses an all-day event with exclusive DTEND from external sources', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:ext-all',
      'SUMMARY:Hotel',
      'DTSTART;VALUE=DATE:20261001',
      'DTEND;VALUE=DATE:20261005',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')
    const parsed = parseICal(ics)
    expect(parsed[0]!.startDate).toBe('2026-10-01')
    expect(parsed[0]!.endDate).toBe('2026-10-04')
  })

  it('parses UTC (Z) timed dates at the right instant', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:ext-z',
      'SUMMARY:Utc event',
      'DTSTART:20260901T100000Z',
      'DTEND:20260901T110000Z',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')
    const parsed = parseICal(ics)
    const expected = new Date('2026-09-01T10:00:00.000Z')
    const actual = new Date(parsed[0]!.startsAt!)
    expect(actual.getTime()).toBe(expected.getTime())
  })

  it('round-trips a recurring event with DTSTART', () => {
    const ev: Event = { ...base, title: 'Standup', startsAt: '2026-08-06T09:00:00', endsAt: '2026-08-06T09:15:00', rrule: 'DTSTART:20260806T090000\nRRULE:FREQ=WEEKLY;INTERVAL=1' }
    const ics = serializeICal([{ ev, reminders: [] }])
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1')
    expect(ics).toContain('DTSTART:20260806T090000')

    const parsed = parseICal(ics)
    expect(parsed[0]!.rrule).toContain('FREQ=WEEKLY')
  })

  it('parses external ics and converts to EventInput', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:ext-1',
      'SUMMARY:Imported event',
      'DTSTART:20260901T100000',
      'DTEND:20260901T110000',
      'RRULE:FREQ=MONTHLY;COUNT=3',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')
    const parsed = parseICal(ics)
    expect(parsed).toHaveLength(1)
    const inputs = toEventInputs(parsed, 'target-cal')
    expect(inputs[0]!.calendarId).toBe('target-cal')
    expect(inputs[0]!.startsAt).toBe('2026-09-01T10:00:00.000')
    expect(inputs[0]!.rrule).toContain('FREQ=MONTHLY')
  })

  it('handles folded lines and continuation', () => {
    const long = 'This is a very long description that definitely exceeds seventy-four characters in a single line so it needs folding'
    const ev: Event = { ...base, title: 'Long', description: long, startsAt: '2026-08-06T09:00:00', endsAt: '2026-08-06T09:30:00' }
    const ics = serializeICal([{ ev, reminders: [] }])
    const parsed = parseICal(ics)
    expect(parsed[0]!.description).toBe(long)
  })
})
