import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isSameWeek,
  isSameYear,
  startOfDay,
  endOfDay,
  getDay,
  parseISO
} from 'date-fns'

export const toISO = (d: Date): string => d.toISOString()
export const toDate = (iso?: string): Date | undefined => (iso ? parseISO(iso) : undefined)

export function rangeStart(view: 'day' | 'week' | 'month' | 'year' | 'agenda' | 'split', date: Date, weekStartsOn: 0 | 1): Date {
  switch (view) {
    case 'day':
      return startOfDay(date)
    case 'week':
      return startOfWeek(date, { weekStartsOn })
    case 'month':
    case 'split':
      return startOfWeek(startOfMonth(date), { weekStartsOn })
    case 'year':
      return startOfMonth(startOfYear(date))
    default:
      return startOfDay(date)
  }
}

export function rangeEnd(view: 'day' | 'week' | 'month' | 'year' | 'agenda' | 'split', date: Date, weekStartsOn: 0 | 1): Date {
  switch (view) {
    case 'day':
      return endOfDay(date)
    case 'week':
      return endOfWeek(date, { weekStartsOn })
    case 'month':
    case 'split':
      return endOfWeek(endOfMonth(date), { weekStartsOn })
    case 'year':
      return endOfMonth(endOfYear(date))
    default:
      return endOfDay(date)
  }
}

export const addPeriod = (view: string, date: Date, delta: number): Date => {
  switch (view) {
    case 'day':
      return addDays(date, delta)
    case 'week':
      return addWeeks(date, delta)
    case 'month':
    case 'split':
      return addMonths(date, delta)
    case 'year':
      return addYears(date, delta)
    default:
      return addDays(date, delta)
  }
}

export function headerTitle(view: string, date: Date, weekStartsOn: 0 | 1): string {
  const opts = { weekStartsOn }
  switch (view) {
    case 'day':
      return format(date, 'EEEE, MMMM d, yyyy')
    case 'week': {
      const s = startOfWeek(date, opts)
      const e = endOfWeek(date, opts)
      if (isSameMonth(s, e)) return `${format(s, 'MMMM d')} – ${format(e, 'd, yyyy')}`
      if (s.getFullYear() === e.getFullYear()) return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
      return `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`
    }
    case 'month':
    case 'split':
      return format(date, 'MMMM yyyy')
    case 'year':
      return format(date, 'yyyy')
    default:
      return format(date, 'EEEE, MMMM d, yyyy')
  }
}

export function startOfYear(d: Date): Date {
  const x = new Date(d)
  x.setMonth(0, 1)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfYear(d: Date): Date {
  const x = new Date(d)
  x.setMonth(11, 31)
  x.setHours(23, 59, 59, 999)
  return x
}

export function* iterateDays(from: Date, to: Date): Generator<Date> {
  let cur = startOfDay(from)
  const last = startOfDay(to)
  while (cur <= last) {
    yield cur
    cur = addDays(cur, 1)
  }
}

/** Formats a Date in an arbitrary IANA timezone (e.g. for a secondary timezone display). */
export function formatInTz(d: Date, tz: string, pattern = 'HH:mm'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour12: false
    }).formatToParts(d)
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
    if (pattern === 'HH:mm') return `${get('hour')}:${get('minute')}`
    return `${get('day')}.${get('month')}.${get('year')}, ${get('hour')}:${get('minute')}`
  } catch {
    return ''
  }
}

export function isoWeekNumber(d: Date): number {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

export { format, isSameDay, isSameMonth, isToday, isSameWeek, isSameYear, startOfDay, endOfDay, getDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth }
