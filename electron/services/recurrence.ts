import { RRule, datetime } from 'rrule'
import type { Event, EventDetail, EventException } from '@shared/types'

export interface Occurrence {
  start: Date
  end: Date
  exception?: EventException
  isException: boolean
  isDeleted: boolean
}

/** Expands an event's RRULE into concrete occurrences overlapping [from, to). */
export function expandEvent(event: Event, exceptions: EventException[], from: Date, to: Date): Occurrence[] {
  if (!event.rrule) {
    if (event.allDay) {
      const start = event.startDate ? new Date(event.startDate + 'T00:00:00') : null
      const end = event.endDate ? new Date(event.endDate + 'T00:00:00') : start
      if (!start || !end || end < from || start >= to) return []
      return [{ start, end: new Date(end.getTime() + 86400000), isException: false, isDeleted: false }]
    }
    if (!event.startsAt || !event.endsAt) return []
    const start = new Date(event.startsAt)
    const end = new Date(event.endsAt)
    if (end < from || start >= to) return []
    return [{ start, end, isException: false, isDeleted: false }]
  }

  const base = event.allDay
    ? (event.startDate ? new Date(event.startDate + 'T00:00:00') : new Date())
    : new Date(event.startsAt!)

  let rule: RRule
  try {
    rule = RRule.fromString(event.rrule.startsWith('DTSTART') ? event.rrule : withDtstart(event.rrule, base))
  } catch {
    return []
  }

  const occurrences: Occurrence[] = []
  const exceptionMap = new Map<string, EventException>()
  for (const ex of exceptions) exceptionMap.set(ex.occurrence, ex)

  const candidates = rule.between(from, new Date(to.getTime() - 1), true)
  for (const occStart of candidates) {
    const occKey = `${occStart.getFullYear()}-${String(occStart.getMonth() + 1).padStart(2, '0')}-${String(occStart.getDate()).padStart(2, '0')}`
    const ex = exceptionMap.get(occKey)
    if (ex?.deleted) continue
    if (ex) {
      const start = ex.startsAt ? new Date(ex.startsAt) : ex.allDay === true ? new Date(occStart) : occStart
      const end = ex.endsAt ? new Date(ex.endsAt) : ex.allDay === true ? new Date(occStart.getTime() + 86400000) : durationEnd(event, occStart)
      occurrences.push({ start, end, exception: ex, isException: true, isDeleted: false })
    } else {
      occurrences.push({ start: occStart, end: durationEnd(event, occStart), isException: false, isDeleted: false })
    }
  }
  return occurrences
}

function durationEnd(event: Event, start: Date): Date {
  if (event.allDay) return new Date(start.getTime() + 86400000)
  const dur = new Date(event.endsAt!).getTime() - new Date(event.startsAt!).getTime()
  return new Date(start.getTime() + dur)
}

/** Builds an RRULE string from simple form fields, with DTSTART embedded. */
export function buildRrule(opts: {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval?: number
  until?: Date | null
  count?: number | null
  byWeekday?: number | null
}): string {
  const rule = new RRule({
    freq: RRule[opts.freq],
    interval: opts.interval ?? 1,
    ...(opts.until ? { until: datetime(opts.until.getFullYear(), opts.until.getMonth() + 1, opts.until.getDate()) } : {}),
    ...(opts.count ? { count: opts.count } : {}),
    ...(opts.byWeekday !== null && opts.byWeekday !== undefined ? { byweekday: [opts.byWeekday] } : {})
  })
  return rule.toString()
}

/** Prepends a DTSTART line so RRule.fromString always gets the anchor time. */
export function withDtstart(rrule: string, dtstart: Date): string {
  const pad = (n: number, l = 2): string => String(n).padStart(l, '0')
  const dt =
    `${dtstart.getUTCFullYear()}${pad(dtstart.getUTCMonth() + 1)}${pad(dtstart.getUTCDate())}` +
    `T${pad(dtstart.getUTCHours())}${pad(dtstart.getUTCMinutes())}${pad(dtstart.getUTCSeconds())}Z`
  return `DTSTART:${dt}\n${rrule}`
}

/** Embeds DTSTART into a freshly built rule string (used by the event dialog). */
export function buildRruleWithStart(opts: Parameters<typeof buildRrule>[0], dtstart: Date): string {
  return withDtstart(buildRrule(opts), dtstart)
}

/** Serializes a detail (with exceptions) for the store when editing a single occurrence. */
export function occurrenceToInput(occ: Occurrence, detail: EventDetail): {
  title?: string
  description?: string
  location?: string
  allDay?: boolean
  startsAt?: string
  endsAt?: string
  startDate?: string
  endDate?: string
  color?: string
  busy?: boolean
} {
  const input: Record<string, unknown> = {}
  if (occ.exception) {
    if (occ.exception.title !== undefined) input.title = occ.exception.title
    if (occ.exception.description !== undefined) input.description = occ.exception.description
    if (occ.exception.location !== undefined) input.location = occ.exception.location
    if (occ.exception.allDay !== undefined) input.allDay = occ.exception.allDay
    if (occ.exception.startsAt !== undefined) input.startsAt = occ.exception.startsAt
    if (occ.exception.endsAt !== undefined) input.endsAt = occ.exception.endsAt
    if (occ.exception.startDate !== undefined) input.startDate = occ.exception.startDate
    if (occ.exception.endDate !== undefined) input.endDate = occ.exception.endDate
    if (occ.exception.color !== undefined) input.color = occ.exception.color
    if (occ.exception.busy !== undefined) input.busy = occ.exception.busy
    return input as typeof input as ReturnType<typeof occurrenceToInput>
  }
  return {
    title: detail.title,
    description: detail.description,
    location: detail.location,
    allDay: detail.allDay,
    startsAt: detail.startsAt,
    endsAt: detail.endsAt,
    startDate: detail.startDate,
    endDate: detail.endDate,
    color: detail.color,
    busy: detail.busy
  }
}
