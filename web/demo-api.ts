import type {
  Calendar,
  CalendarInput,
  CalendarLink,
  Event,
  EventDetail,
  EventException,
  EventInput,
  EventOccurrence,
  FeedInput,
  ICalFeed,
  LoginResult,
  Reminder,
  ShareInput,
  User
} from '@shared/types'
import type { CalendarApi } from '../electron/preload'
import { DEMO_TOKEN, demoCalendars, demoUser, seedEvents, seedReminders } from './demo-data'

const DAY = 86_400_000

interface RruleRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  interval: number
  byday: number[]
}

const WEEKDAYS: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 }

function parseRrule(rrule: string | undefined): RruleRule | null {
  if (!rrule) return null
  const lower = rrule.replace(/\s/g, '').toUpperCase()
  const freq = /FREQ=(\w+)/.exec(lower)?.[1]
  const interval = Number(/INTERVAL=(\d+)/.exec(lower)?.[1] ?? '1') || 1
  const bydayRaw = /BYDAY=([A-Z,]+)/.exec(lower)?.[1] ?? ''
  const byday = bydayRaw
    .split(',')
    .map((d) => WEEKDAYS[d.replace(/^.+\d+/g, '')] ?? WEEKDAYS[d] ?? -1)
    .filter((d) => d >= 0)
  const allowed = ['DAILY', 'WEEKLY', 'MONTHLY']
  if (!freq || !allowed.includes(freq)) return null
  return { freq: freq as RruleRule['freq'], interval, byday }
}

function eventStartMs(event: Event): number {
  return new Date(event.startsAt ?? event.startDate + 'T00:00:00').getTime()
}

function durationMs(event: Event): number {
  const end = new Date(event.endsAt ?? event.endDate + 'T23:59:59.000Z').getTime()
  const start = eventStartMs(event)
  const diff = end - start
  return diff > 0 ? diff : 60 * 60 * 1000
}

function timeKey(ts: number): string {
  return new Date(ts).toISOString()
}

const startOfUtcDay = (ts: number): number => {
  const d = new Date(ts)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime()
}

/** Expand an event's occurrence start timestamps within [from, to]. */
function expandStarts(event: Event, from: number, to: number): number[] {
  const base = eventStartMs(event)
  const rule = parseRrule(event.rrule)
  if (!rule) return base >= from && base <= to ? [base] : []
  const baseDay = startOfUtcDay(base)
  const out: number[] = []
  let guard = 0
  const consider = (ts: number): void => {
    if (guard++ > 50_000) return
    if (ts >= from && ts <= to) out.push(ts)
  }
  if (rule.freq === 'DAILY') {
    for (let i = 0; i * rule.interval * DAY + baseDay <= to + DAY; i++) {
      const ts = baseDay + i * rule.interval * DAY
      consider(ts)
      if (ts > to) break
    }
  } else if (rule.freq === 'WEEKLY') {
    const days = rule.byday.length ? rule.byday : [new Date(base).getUTCDay()]
    const week0 = baseDay - new Date(baseDay).getUTCDay() * DAY
    for (let w = 0; ; w++) {
      const ws = week0 + w * rule.interval * 7 * DAY
      if (ws > to + 7 * DAY) break
      for (const d of days) consider(ws + d * DAY)
    }
  } else {
    const bd = new Date(base)
    const bday = bd.getUTCDate()
    const bmonth = bd.getUTCMonth()
    const byear = bd.getUTCFullYear()
    for (let m = 0; ; m++) {
      const monthIdx = bmonth + m * rule.interval
      const y = byear + Math.floor(monthIdx / 12)
      const mm = ((monthIdx % 12) + 12) % 12
      const last = new Date(Date.UTC(y, mm + 1, 0)).getUTCDate()
      const ts = Date.UTC(y, mm, Math.min(bday, last), bd.getUTCHours(), bd.getUTCMinutes())
      if (ts > to) break
      consider(ts)
    }
  }
  return out
}

function buildOccurrence(event: Event, start: number, exception: EventException | undefined): EventOccurrence {
  const end = start + durationMs(event)
  return {
    event: { ...event },
    exception: exception ? { ...exception } : undefined,
    start: timeKey(start),
    end: timeKey(end),
    allDay: event.allDay,
    isException: !!exception && !exception.deleted
  }
}

function occurrencesInRange(event: Event, from: number, to: number): EventOccurrence[] {
  if (event.deletedAt) return []
  const starts = expandStarts(event, from, to)
  const duration = event.allDay ? DAY : durationMs(event)
  return starts
    .filter((ts) => ts + duration > from)
    .map((ts): EventOccurrence | null => {
      const ex = state.exceptions.filter((x) => x.eventId === event.id && x.occurrence === timeKey(ts))[0]
      if (ex && ex.deleted) return null
      return buildOccurrence(event, ts, ex)
    })
    .filter((o): o is EventOccurrence => o !== null)
}

interface DemoState {
  seq: number
  calendars: Calendar[]
  events: Event[]
  trash: Event[]
  exceptions: EventException[]
  reminders: Reminder[]
  settings: Record<string, unknown>
}

function clampRange(fromMs: number, toMs: number): { from: number; to: number } {
  const now = Date.now()
  const min = now - 5 * 366 * DAY
  const max = now + 10 * 366 * DAY
  return { from: Math.max(fromMs, min), to: Math.min(toMs, max) }
}

const calSeed = demoCalendars.map((c) => ({ ...c }))
const evSeed = seedEvents()
const remSeed = seedReminders(evSeed)

const state: DemoState = {
  seq: 100,
  calendars: calSeed,
  events: evSeed,
  trash: [],
  exceptions: [],
  reminders: remSeed,
  settings: {}
}

function nid(prefix: string): string {
  state.seq += 1
  return `${prefix}-${Date.now().toString(36)}-${state.seq}`
}

function icsDate(dt: string): string {
  return dt.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function buildIcs(): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Calendar//Demo//EN']
  for (const ev of state.events) {
    if (ev.deletedAt) continue
    lines.push('BEGIN:VEVENT', `UID:${ev.id}`)
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${(ev.startDate ?? '').replace(/-/g, '')}`)
      lines.push(`DTEND;VALUE=DATE:${(ev.endDate ?? (ev.startDate ?? '')).replace(/-/g, '')}`)
    } else {
      lines.push(`DTSTART:${icsDate(ev.startsAt ?? '')}`)
      lines.push(`DTEND:${icsDate(ev.endsAt ?? '')}`)
    }
    lines.push(`SUMMARY:${ev.title}`, 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function createDemoApi(): CalendarApi {
  return {
    auth: {
      register: async (): Promise<LoginResult> => ({ token: DEMO_TOKEN, user: demoUser }),
      login: async (): Promise<LoginResult> => ({ token: DEMO_TOKEN, user: demoUser }),
      logout: async (): Promise<void> => undefined,
      validate: async (): Promise<User> => ({ ...demoUser })
    },
    calendars: {
      list: async (): Promise<Calendar[]> => state.calendars.map((c) => ({ ...c })),
      create: async (_t, input: CalendarInput): Promise<Calendar> => {
        const now = new Date().toISOString()
        const cal: Calendar = {
          id: nid('cal'),
          name: input.name,
          color: input.color,
          description: input.description,
          visible: input.visible ?? true,
          defaultReminderMinutes: input.defaultReminderMinutes,
          isDefault: input.isDefault ?? false,
          role: 'owner',
          createdAt: now,
          updatedAt: now
        }
        state.calendars.push(cal)
        return { ...cal }
      },
      update: async (_t, id, input: Partial<CalendarInput>): Promise<Calendar> => {
        const cal = state.calendars.find((c) => c.id === id)
        if (!cal) throw new Error('Calendar not found')
        Object.assign(cal, input, { updatedAt: new Date().toISOString() })
        return { ...cal }
      },
      delete: async (_t, id): Promise<void> => {
        state.calendars = state.calendars.filter((c) => c.id !== id)
        state.events = state.events.filter((e) => e.calendarId !== id)
        state.trash = state.trash.filter((e) => e.calendarId !== id)
      },
      share: async (): Promise<void> => undefined,
      unshare: async (): Promise<void> => undefined,
      shares: async (): Promise<unknown[]> => [],
      createLink: async (_t, calendarId): Promise<CalendarLink> => ({
        token: `link-${calendarId}-${Math.random().toString(36).slice(2, 10)}`,
        calendarId,
        createdBy: demoUser.id,
        createdAt: new Date().toISOString()
      }),
      listLinks: async (): Promise<unknown[]> => [],
      removeLink: async (): Promise<void> => undefined
    },
    feeds: {
      list: async (): Promise<ICalFeed[]> => [],
      create: async (_t, _i: FeedInput): Promise<ICalFeed> => ({
        id: nid('feed'),
        calendarId: _i.calendarId,
        url: _i.url,
        ownerId: demoUser.id,
        createdAt: new Date().toISOString()
      }),
      remove: async (): Promise<void> => undefined,
      sync: async (): Promise<Record<string, unknown>> => ({ eventsAdded: 0, errors: [] })
    },
    public: {
      getOccurrences: async (): Promise<EventOccurrence[]> => []
    },
    events: {
      list: async (): Promise<Event[]> => state.events.filter((e) => !e.deletedAt).map((e) => ({ ...e })),
      get: async (_t, id): Promise<EventDetail> => {
        const ev = state.events.find((e) => e.id === id)
        if (!ev) throw new Error('Event not found')
        return {
          ...ev,
          attendees: [],
          reminders: state.reminders.filter((r) => r.eventId === id).map((r) => ({ ...r })),
          exceptions: state.exceptions.filter((x) => x.eventId === id).map((x) => ({ ...x }))
        }
      },
      create: async (_t, input: EventInput): Promise<Event> => {
        const now = new Date().toISOString()
        const ev: Event = {
          id: nid('event'),
          calendarId: input.calendarId,
          title: input.title,
          description: input.description,
          location: input.location,
          allDay: input.allDay ?? false,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          startDate: input.startDate,
          endDate: input.endDate,
          timezone: input.timezone,
          color: input.color || state.calendars.find((c) => c.id === input.calendarId)?.color,
          busy: input.busy ?? true,
          rrule: input.rrule,
          rruleTz: input.rruleTz,
          icon: input.icon,
          createdAt: now,
          updatedAt: now
        }
        state.events.push(ev)
        return { ...ev }
      },
      update: async (_t, id, input: Partial<EventInput>): Promise<Event> => {
        const ev = state.events.find((e) => e.id === id)
        if (!ev) throw new Error('Event not found')
        Object.assign(ev, input, { updatedAt: new Date().toISOString() })
        return { ...ev }
      },
      delete: async (_t, id): Promise<void> => {
        const ev = state.events.find((e) => e.id === id)
        if (!ev) return
        ev.deletedAt = new Date().toISOString()
        if (!state.trash.some((t) => t.id === id)) state.trash.push({ ...ev })
      },
      trash: async (): Promise<Event[]> => state.trash.map((t) => ({ ...t })),
      restore: async (_t, id): Promise<void> => {
        const ev = state.events.find((e) => e.id === id)
        if (ev) {
          ev.deletedAt = null
          state.trash = state.trash.filter((t) => t.id !== id)
        }
      },
      purge: async (_t, id): Promise<void> => {
        state.events = state.events.filter((e) => e.id !== id)
        state.trash = state.trash.filter((t) => t.id !== id)
        state.reminders = state.reminders.filter((r) => r.eventId !== id)
      },
      search: async (_t, query: string): Promise<Event[]> => {
        const q = query.toLowerCase()
        return state.events
          .filter((e) => !e.deletedAt)
          .filter((e) =>
            e.title.toLowerCase().includes(q) ||
            (e.description ?? '').toLowerCase().includes(q) ||
            (e.location ?? '').toLowerCase().includes(q)
          )
          .slice(0, 50)
          .map((e) => ({ ...e }))
      },
      listOccurrences: async (_t, from, to, calendarIds?): Promise<EventOccurrence[]> => {
        const r = clampRange(new Date(from).getTime(), new Date(to).getTime())
        const out: EventOccurrence[] = []
        for (const ev of state.events) {
          if (ev.deletedAt) continue
          if (calendarIds && calendarIds.length > 0 && !calendarIds.includes(ev.calendarId)) continue
          out.push(...occurrencesInRange(ev, r.from, r.to))
        }
        return out
      },
      occurrences: async (_t, eventId, from, to): Promise<EventOccurrence[]> => {
        const ev = state.events.find((e) => e.id === eventId)
        if (!ev) return []
        const range = clampRange(new Date(from).getTime(), new Date(to).getTime())
        return occurrencesInRange(ev, range.from, range.to)
      },
      updateOccurrence: async (_t, eventId, occurrence, input: Partial<EventInput>): Promise<void> => {
        const ex = state.exceptions.find((x) => x.eventId === eventId && x.occurrence === occurrence)
        if (ex) Object.assign(ex, input, { deleted: false })
        else state.exceptions.push({ id: nid('ex'), eventId, occurrence, ...input, deleted: false })
      },
      deleteOccurrence: async (_t, eventId, occurrence): Promise<void> => {
        const ex = state.exceptions.find((x) => x.eventId === eventId && x.occurrence === occurrence)
        if (ex) ex.deleted = true
        else state.exceptions.push({ id: nid('ex'), eventId, occurrence, deleted: true })
      },
      splitSeries: async (_t, eventId, occurrence, input: Partial<EventInput>): Promise<Event> => {
        const src = state.events.find((e) => e.id === eventId)
        if (!src) throw new Error('Event not found')
        const now = new Date().toISOString()
        const split: Event = {
          ...src,
          id: nid('event'),
          title: input.title ?? src.title,
          description: input.description,
          location: input.location,
          color: input.color,
          rrule: undefined,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          startDate: input.startDate,
          endDate: input.endDate,
          updatedAt: now
        }
        state.events.push(split)
        state.exceptions.push({ id: nid('ex'), eventId, occurrence, deleted: true })
        return { ...split }
      }
    },
    reminders: {
      create: async (_t, eventId, minutes): Promise<Reminder> => {
        const rem: Reminder = { id: nid('rem'), eventId, minutes }
        state.reminders = [...state.reminders.filter((r) => !(r.eventId === eventId && r.minutes === minutes)), rem]
        return { ...rem }
      },
      delete: async (_t, id): Promise<void> => {
        state.reminders = state.reminders.filter((r) => r.id !== id)
      },
      upcoming: async (_t, days): Promise<Array<Reminder & { title: string; startsAt?: string; calendarName: string }>> => {
        const nowMs = Date.now()
        const horizonMs = nowMs + days * DAY
        const out: Array<Reminder & { title: string; startsAt?: string; calendarName: string }> = []
        for (const r of state.reminders) {
          if (r.sentAt) continue
          const ev = state.events.find((e) => e.id === r.eventId)
          if (!ev || ev.deletedAt) continue
          const occs = occurrencesInRange(ev, nowMs, horizonMs)
          const next = occs.find((o) => {
            const fire = new Date(o.start).getTime() - r.minutes * 60000
            return fire > nowMs && fire <= horizonMs
          })
          if (!next) continue
          const fire = new Date(next.start).getTime() - r.minutes * 60000
          const cal = state.calendars.find((c) => c.id === ev.calendarId)
          out.push({ ...r, title: ev.title, startsAt: new Date(fire).toISOString(), calendarName: cal?.name ?? 'Calendar' })
        }
        return out
      }
    },
    ical: {
      exportICal: async (): Promise<string> => buildIcs(),
      importICal: async (): Promise<{ canceled: boolean; count: number }> => ({ canceled: false, count: 0 }),
      importContent: async (): Promise<number> => 0,
      exportJson: async (): Promise<string> => JSON.stringify(
        { calendars: state.calendars, events: state.events.filter((e) => !e.deletedAt), reminders: state.reminders },
        null,
        2
      ),
      importJson: async (): Promise<number> => 0
    },
    settings: {
      get: async (_t, key): Promise<unknown> => state.settings[key],
      set: async (_t, key, value): Promise<void> => {
        state.settings[key] = value
      }
    },
    updates: {
      subscribe: (): (() => void) => () => undefined
    },
    appInfo: async (): Promise<{ name: string; version: string }> => ({ name: 'Calendar Demo', version: __APP_VERSION__ })
  }
}