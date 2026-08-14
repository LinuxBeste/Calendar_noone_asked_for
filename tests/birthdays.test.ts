import { describe, it, expect } from 'vitest'
import { parseContacts, serializeContacts, birthdayOccurrences, turnsAge, isBirthdayEvent, BIRTHDAYS_CAL_ID } from '../src/utils/birthdays'

const CONTACT = { id: 'c1', name: 'Ada', birthDate: '1815-12-10' }

describe('parseContacts / serializeContacts', () => {
  it('round-trips valid contacts', () => {
    expect(parseContacts(serializeContacts([CONTACT]))).toEqual([CONTACT])
  })

  it('returns [] for empty or garbage input', () => {
    expect(parseContacts('')).toEqual([])
    expect(parseContacts(null)).toEqual([])
    expect(parseContacts('not json')).toEqual([])
    expect(parseContacts('{"a":1}')).toEqual([])
  })

  it('drops malformed entries', () => {
    expect(parseContacts(JSON.stringify([CONTACT, { id: 'x' }, 'junk', { id: 'y', name: 'Y', birthDate: 'bad' }]))).toEqual([CONTACT])
  })
})

describe('birthdayOccurrences', () => {
  it('creates an all-day occurrence per year within the range', () => {
    const occs = birthdayOccurrences([CONTACT], '2025-01-01', '2026-12-31')
    expect(occs).toHaveLength(2)
    expect(occs[0]).toMatchObject({ allDay: true, isException: false })
    expect(occs[0]!.start).toBe('2025-12-10T00:00:00')
    expect(occs[0]!.end).toBe('2025-12-11T00:00:00')
    expect(occs[0]!.event).toMatchObject({
      calendarId: BIRTHDAYS_CAL_ID,
      title: 'Ada',
      allDay: true,
      color: '#db2777'
    })
  })

  it('returns [] for an empty contact list or bad range', () => {
    expect(birthdayOccurrences([], '2025-01-01', '2025-12-31')).toEqual([])
    expect(birthdayOccurrences([CONTACT], 'nope', '2025-12-31')).toEqual([])
  })

  it('clamps Feb 29 to Feb 28 in non-leap years', () => {
    const occs = birthdayOccurrences([{ ...CONTACT, birthDate: '2000-02-29' }], '2023-01-01', '2024-12-31')
    expect(occs.map((o) => o.start)).toEqual(['2023-02-28T00:00:00', '2024-02-29T00:00:00'])
  })
})

describe('turnsAge / isBirthdayEvent', () => {
  it('computes the age someone turns in a given year', () => {
    expect(turnsAge('1815-12-10', 2026)).toBe(211)
  })

  it('returns null without a year', () => {
    expect(turnsAge('12-10', 2026)).toBeNull()
  })

  it('recognizes birthday events only on the virtual calendar', () => {
    const event = { ...CONTACT, calendarId: BIRTHDAYS_CAL_ID, id: `birthday-${CONTACT.id}`, title: 'Ada', allDay: true, busy: false } as never
    expect(isBirthdayEvent(event as never)).toBe(true)
    expect(isBirthdayEvent({ ...(event as object), calendarId: 'real' } as never)).toBe(false)
    expect(isBirthdayEvent(undefined)).toBe(false)
  })
})
