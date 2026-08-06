import { describe, it, expect } from 'vitest'
import { expandEvent, buildRrule } from '../server/services/recurrence'
import type { Event, EventException } from '../shared/types'

const base = (over: Partial<Event>): Event => ({
  id: 'e1',
  calendarId: 'c1',
  title: 'Standup',
  allDay: false,
  busy: true,
  createdAt: '',
  updatedAt: '',
  ...over
})

describe('expandEvent', () => {
  it('returns a single occurrence for non-recurring events', () => {
    const ev = base({
      startsAt: '2026-08-06T09:00:00.000Z',
      endsAt: '2026-08-06T09:30:00.000Z'
    })
    const occ = expandEvent(ev, [], new Date('2026-08-01'), new Date('2026-09-01'))
    expect(occ).toHaveLength(1)
    expect(occ[0]!.start.toISOString()).toBe('2026-08-06T09:00:00.000Z')
  })

  it('expands a daily rule over the range', () => {
    const ev = base({
      startsAt: '2026-08-03T09:00:00.000Z',
      endsAt: '2026-08-03T09:30:00.000Z',
      rrule: buildRrule({ freq: 'DAILY' })
    })
    const occ = expandEvent(ev, [], new Date('2026-08-01'), new Date('2026-08-06'))
    expect(occ).toHaveLength(3)
    expect(occ[0]!.start.toISOString()).toBe('2026-08-03T09:00:00.000Z')
    expect(occ[2]!.start.toISOString()).toBe('2026-08-05T09:00:00.000Z')
  })

  it('respects a count limit', () => {
    const ev = base({
      startsAt: '2026-08-03T09:00:00.000Z',
      endsAt: '2026-08-03T09:30:00.000Z',
      rrule: buildRrule({ freq: 'WEEKLY', count: 2 })
    })
    const occ = expandEvent(ev, [], new Date('2026-08-01'), new Date('2026-09-15'))
    expect(occ).toHaveLength(2)
  })

  it('skips deleted exception dates and applies overrides', () => {
    const ev = base({
      startsAt: '2026-08-03T09:00:00.000Z',
      endsAt: '2026-08-03T09:30:00.000Z',
      rrule: buildRrule({ freq: 'DAILY' })
    })
    const exceptions: EventException[] = [
      { id: 'x1', eventId: 'e1', occurrence: '2026-08-04', deleted: true },
      {
        id: 'x2',
        eventId: 'e1',
        occurrence: '2026-08-05',
        startsAt: '2026-08-05T14:00:00.000Z',
        endsAt: '2026-08-05T15:00:00.000Z',
        deleted: false
      }
    ]
    const occ = expandEvent(ev, exceptions, new Date('2026-08-01'), new Date('2026-08-10'))
    expect(occ).toHaveLength(6)
    expect(occ[0]!.start.toISOString()).toBe('2026-08-03T09:00:00.000Z')
    expect(occ[1]!.start.toISOString()).toBe('2026-08-05T14:00:00.000Z')
    expect(occ[1]!.isException).toBe(true)
    expect(occ[2]!.start.toISOString()).toBe('2026-08-06T09:00:00.000Z')
  })

  it('handles all-day events with end dates', () => {
    const ev = base({ allDay: true, startDate: '2026-08-10', endDate: '2026-08-12' })
    const occ = expandEvent(ev, [], new Date('2026-08-01'), new Date('2026-09-01'))
    expect(occ).toHaveLength(1)
    const fmt = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(fmt(occ[0]!.start)).toBe('2026-08-10')
    expect(fmt(occ[0]!.end)).toBe('2026-08-13')
  })
})

describe('buildRrule', () => {
  it('builds standard strings', () => {
    expect(buildRrule({ freq: 'DAILY' })).toContain('FREQ=DAILY')
    expect(buildRrule({ freq: 'WEEKLY', interval: 2 })).toContain('INTERVAL=2')
    expect(buildRrule({ freq: 'MONTHLY', byWeekday: 0 })).toContain('BYDAY=MO')
    expect(buildRrule({ freq: 'YEARLY', until: new Date('2027-08-06') })).toContain('UNTIL=')
  })
})
