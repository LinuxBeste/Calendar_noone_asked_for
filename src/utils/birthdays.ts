import type { Event, EventOccurrence } from '@shared/types'

/** Virtual calendar shown for contact birthdays (client-side only). */
export const BIRTHDAYS_CAL_ID = 'birthdays'
export const BIRTHDAYS_COLOR = '#db2777'
export const BIRTHDAYS_NAME = 'Birthdays'
const ID_PREFIX = 'birthday-'

export interface Contact {
  id: string
  name: string
  /** yyyy-MM-dd */
  birthDate: string
  note?: string
}

export function isBirthdayEvent(event?: Event | null): boolean {
  return !!event && event.calendarId === BIRTHDAYS_CAL_ID && event.id.startsWith(ID_PREFIX)
}

/** Serialized into the `contacts` user setting; never throws on garbage. */
export function parseContacts(raw: string | undefined | null): Contact[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (c): c is Contact =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as Contact).id === 'string' &&
        typeof (c as Contact).name === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test((c as Contact).birthDate)
    )
  } catch {
    return []
  }
}

export function serializeContacts(contacts: Contact[]): string {
  return JSON.stringify(contacts)
}

/** Age someone born on `birthDate` will turn in `year`, or null when no year is known. */
export function turnsAge(birthDate: string, year: number): number | null {
  const y = Number(birthDate.slice(0, 4))
  if (!Number.isFinite(y)) return null
  return year - y
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function occurrencesForContact(contact: Contact, from: Date, to: Date): EventOccurrence[] {
  const out: EventOccurrence[] = []
  const birthYear = Number(contact.birthDate.slice(0, 4))
  const monthDay = contact.birthDate.slice(5)
  const firstYear = Math.max(from.getFullYear(), Number.isFinite(birthYear) ? 1900 : from.getFullYear())
  const lastYear = Math.min(to.getFullYear(), 2100)
  for (let year = firstYear; year <= lastYear; year++) {
    const month = Number(monthDay.slice(0, 2)) - 1
    const day = Math.min(Number(monthDay.slice(3, 5)), new Date(year, month + 1, 0).getDate())
    const date = new Date(year, month, day)
    if (Number.isNaN(date.getTime())) continue
    if (date < from || date > to) continue
    const startStr = `${localDateStr(date)}T00:00:00`
    const end = new Date(date.getTime() + 86400000)
    out.push({
      event: {
        id: `${ID_PREFIX}${contact.id}`,
        calendarId: BIRTHDAYS_CAL_ID,
        title: contact.name,
        allDay: true,
        startDate: localDateStr(date),
        endDate: localDateStr(end),
        busy: false,
        color: BIRTHDAYS_COLOR,
        icon: '🎂',
        description: contact.note,
        createdAt: '',
        updatedAt: '',
        deletedAt: null
      },
      start: startStr,
      end: `${localDateStr(end)}T00:00:00`,
      allDay: true,
      isException: false
    })
  }
  return out
}

/** Synthetic all-day occurrences for all contacts within [from, to] (local dates). */
export function birthdayOccurrences(contacts: Contact[], from: string, to: string): EventOccurrence[] {
  if (contacts.length === 0) return []
  const fromD = new Date(from.length > 10 ? from : from + 'T00:00:00')
  const toD = new Date(to.length > 10 ? to : to + 'T00:00:00')
  if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) return []
  return contacts.flatMap((c) => occurrencesForContact(c, fromD, toD))
}